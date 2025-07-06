import { GuildMember } from 'discord.js';
import { XPGainReason, UserStats, LeaderboardEntry } from '../types';
import { performanceManager } from './performanceManager';
import { db } from './optimizedDatabase';
import { EventEmitter } from 'events';

interface XPBatch {
  userId: string;
  guildId: string;
  xpGain: number;
  reason: XPGainReason;
  timestamp: number;
}

interface XPMultiplier {
  type: 'role' | 'channel' | 'time' | 'boost' | 'event';
  identifier: string;
  multiplier: number;
  startTime?: number;
  endTime?: number;
}

interface LevelReward {
  level: number;
  roleId?: string;
  xpBonus?: number;
  announcement?: string;
}

export class OptimizedXPSystem extends EventEmitter {
  private cooldowns = new Map<string, number>();
  private xpBatch: XPBatch[] = [];
  private batchProcessingInterval: NodeJS.Timeout;
  private leaderboardCache = new Map<string, { data: LeaderboardEntry[]; timestamp: number }>();
  private userStatsCache = new Map<string, { data: UserStats; timestamp: number }>();
  private multipliers = new Map<string, XPMultiplier[]>();
  private levelRewards = new Map<string, LevelReward[]>();

  constructor() {
    super();
    this.batchProcessingInterval = setInterval(() => {
      this.processBatch();
    }, 5000);
    
    this.startCacheCleanup();
    this.loadMultipliers();
  }

  async gainXP(
    userId: string,
    guildId: string,
    username: string,
    reason: XPGainReason = XPGainReason.MESSAGE,
    customAmount?: number,
    member?: GuildMember
  ): Promise<{ gained: number; levelUp: boolean; newLevel?: number; multiplier?: number } | null> {
    
    if (!await this.isXPEnabled(guildId)) return null;
    
    if (await this.isUserFrozen(userId, guildId)) return null;

    if (reason === XPGainReason.MESSAGE && !this.checkCooldown(userId, guildId)) {
      return null;
    }

    const baseXP = await this.calculateBaseXP(guildId, customAmount);
    const multiplier = await this.calculateMultiplier(userId, guildId, member, reason);
    const finalXP = Math.floor(baseXP * multiplier);

    this.addToBatch({
      userId,
      guildId,
      xpGain: finalXP,
      reason,
      timestamp: Date.now()
    });

    if (reason === XPGainReason.MESSAGE) {
      this.setCooldown(userId, guildId);
    }

    const currentStats = await this.getUserStats(userId, guildId);
    if (currentStats) {
      const oldLevel = currentStats.level;
      const newXP = currentStats.xp + finalXP;
      const newLevel = this.calculateLevel(newXP);
      const levelUp = newLevel > oldLevel;

      this.invalidateUserCache(userId, guildId);
      this.invalidateLeaderboardCache(guildId);

      return {
        gained: finalXP,
        levelUp,
        newLevel: levelUp ? newLevel : undefined,
        multiplier
      };
    }

    return { gained: finalXP, levelUp: false, multiplier };
  }

  private addToBatch(xpData: XPBatch): void {
    this.xpBatch.push(xpData);
    
    if (this.xpBatch.length >= 100) {
      this.processBatch();
    }
  }

  private async processBatch(): Promise<void> {
    if (this.xpBatch.length === 0) return;

    const batch = this.xpBatch.splice(0);
    const groupedBatch = this.groupBatchByUser(batch);

    try {
      await performanceManager.measureDatabaseQuery('xp-batch-process', async () => {
        const operations = [];

        for (const [userKey, xpItems] of groupedBatch) {
          const [userId, guildId] = userKey.split('-');
          const totalXP = xpItems.reduce((sum, item) => sum + item.xpGain, 0);
          
          operations.push({
            operation: 'user.upsert',
            data: {
              where: { id_guildId: { id: userId, guildId } },
              update: {
                xp: { increment: totalXP },
                totalXp: { increment: totalXP },
                monthlyXp: { increment: totalXP },
                lastMessage: new Date(),
                username: userId
              },
              create: {
                id: userId,
                guildId,
                username: userId,
                xp: totalXP,
                totalXp: totalXP,
                monthlyXp: totalXP,
                level: this.calculateLevel(totalXP),
                lastMessage: new Date()
              }
            }
          });

          for (const item of xpItems) {
            operations.push({
              operation: 'xpHistory.create',
              data: {
                data: {
                  userId,
                  guildId,
                  xpGained: item.xpGain,
                  reason: item.reason,
                  createdAt: new Date(item.timestamp)
                }
              }
            });
          }
        }

        await db.batchWrite(operations);
      });

      await this.checkLevelUpsInBatch(groupedBatch);
      
    } catch (error) {
      console.error('Error processing XP batch:', error);
      this.xpBatch.unshift(...batch);
    }
  }

  private groupBatchByUser(batch: XPBatch[]): Map<string, XPBatch[]> {
    const grouped = new Map<string, XPBatch[]>();
    
    for (const item of batch) {
      const key = `${item.userId}-${item.guildId}`;
      const existing = grouped.get(key) || [];
      existing.push(item);
      grouped.set(key, existing);
    }
    
    return grouped;
  }

  private async checkLevelUpsInBatch(groupedBatch: Map<string, XPBatch[]>): Promise<void> {
    for (const [userKey, xpItems] of groupedBatch) {
      const [userId, guildId] = userKey.split('-');
      const totalXP = xpItems.reduce((sum, item) => sum + item.xpGain, 0);
      
      const oldStats = await this.getUserStats(userId, guildId);
      if (oldStats) {
        const oldLevel = oldStats.level;
        const newXP = oldStats.xp + totalXP;
        const newLevel = this.calculateLevel(newXP);
        
        if (newLevel > oldLevel) {
          await this.handleLevelUp(userId, guildId, oldLevel, newLevel);
        }
      }
    }
  }

  private async handleLevelUp(userId: string, guildId: string, oldLevel: number, newLevel: number): Promise<void> {
    await db.query('updateUserLevel', async (client) => {
      return client.user.update({
        where: { id_guildId: { id: userId, guildId } },
        data: { level: newLevel }
      });
    });

    const rewards = await this.checkLevelRewards(guildId, newLevel);
    
    this.emit('levelUp', {
      userId,
      guildId,
      oldLevel,
      newLevel,
      rewards
    });

    this.invalidateUserCache(userId, guildId);
  }

  async getUserStats(userId: string, guildId: string): Promise<UserStats | null> {
    const cacheKey = `${userId}-${guildId}`;
    const cached = this.userStatsCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < 300000) {
      return cached.data;
    }

    const user = await db.query('getUserStats', async (client) => {
      return client.user.findUnique({
        where: { id_guildId: { id: userId, guildId } }
      });
    }, { 
      readOnly: true,
      cache: { key: `user-stats-${userId}-${guildId}`, ttl: 300000 }
    });

    if (!user) return null;

    const [totalRank, monthlyRank] = await Promise.all([
      this.getUserRank(userId, guildId, false),
      this.getUserRank(userId, guildId, true)
    ]);

    const stats: UserStats = {
      userId: user.id,
      guildId: user.guildId,
      username: user.username,
      xp: user.xp,
      level: user.level,
      totalXp: user.totalXp,
      monthlyXp: user.monthlyXp,
      rank: totalRank,
      monthlyRank: monthlyRank
    };

    this.userStatsCache.set(cacheKey, { data: stats, timestamp: Date.now() });
    return stats;
  }

  async getLeaderboard(
    guildId: string,
    limit: number = 10,
    monthly: boolean = false
  ): Promise<LeaderboardEntry[]> {
    const cacheKey = `${guildId}-${monthly ? 'monthly' : 'total'}-${limit}`;
    const cached = this.leaderboardCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < 180000) {
      return cached.data;
    }

    const users = await db.query('getLeaderboard', async (client) => {
      return client.user.findMany({
        where: {
          guildId,
          ...(monthly ? { monthlyXp: { gt: 0 } } : { xp: { gt: 0 } })
        },
        orderBy: monthly ? { monthlyXp: 'desc' } : { xp: 'desc' },
        take: limit,
        select: {
          id: true,
          username: true,
          xp: true,
          monthlyXp: true,
          level: true
        }
      });
    }, { 
      readOnly: true,
      cache: { key: cacheKey, ttl: 180000 }
    });

    const leaderboard = users.map((user, index) => ({
      userId: user.id,
      username: user.username || `User#${user.id.slice(-4)}`,
      xp: monthly ? user.monthlyXp : user.xp,
      level: user.level,
      rank: index + 1
    }));

    this.leaderboardCache.set(cacheKey, { data: leaderboard, timestamp: Date.now() });
    return leaderboard;
  }

  private async getUserRank(userId: string, guildId: string, monthly: boolean): Promise<number> {
    const rank = await db.query('getUserRank', async (client) => {
      return client.user.count({
        where: {
          guildId,
          ...(monthly 
            ? { monthlyXp: { gt: client.user.findUnique({
                where: { id_guildId: { id: userId, guildId } },
                select: { monthlyXp: true }
              })?.monthlyXp || 0 } }
            : { xp: { gt: client.user.findUnique({
                where: { id_guildId: { id: userId, guildId } },
                select: { xp: true }
              })?.xp || 0 } }
          )
        }
      });
    }, { 
      readOnly: true,
      cache: { key: `rank-${userId}-${guildId}-${monthly}`, ttl: 300000 }
    });

    return rank + 1;
  }

  private async calculateBaseXP(guildId: string, customAmount?: number): Promise<number> {
    if (customAmount !== undefined) return customAmount;

    const guildSettings = await this.getGuildSettings(guildId);
    return Math.floor(
      Math.random() * (guildSettings.xpMax - guildSettings.xpMin + 1) + guildSettings.xpMin
    );
  }

  private async calculateMultiplier(
    userId: string,
    guildId: string,
    member?: GuildMember,
    reason?: XPGainReason
  ): Promise<number> {
    let totalMultiplier = 1;

    const guildSettings = await this.getGuildSettings(guildId);
    totalMultiplier *= guildSettings.xpRate;

    const guildMultipliers = this.multipliers.get(guildId) || [];
    const now = Date.now();

    for (const multiplier of guildMultipliers) {
      if (multiplier.startTime && multiplier.startTime > now) continue;
      if (multiplier.endTime && multiplier.endTime < now) continue;

      switch (multiplier.type) {
        case 'role':
          if (member?.roles.cache.has(multiplier.identifier)) {
            totalMultiplier *= multiplier.multiplier;
          }
          break;
        case 'channel':
          if (member?.voice.channelId === multiplier.identifier) {
            totalMultiplier *= multiplier.multiplier;
          }
          break;
        case 'time':
          const hour = new Date().getHours();
          const timeRange = multiplier.identifier.split('-').map(Number);
          if (hour >= timeRange[0] && hour <= timeRange[1]) {
            totalMultiplier *= multiplier.multiplier;
          }
          break;
        case 'boost':
          if (member?.premiumSince) {
            totalMultiplier *= multiplier.multiplier;
          }
          break;
        case 'event':
          totalMultiplier *= multiplier.multiplier;
          break;
      }
    }

    if (reason === XPGainReason.VOICE) {
      totalMultiplier *= 0.5;
    }

    return Math.max(0.1, Math.min(10, totalMultiplier));
  }

  private checkCooldown(userId: string, guildId: string): boolean {
    const key = `${userId}-${guildId}`;
    const lastGain = this.cooldowns.get(key) || 0;
    const now = Date.now();
    
    return now - lastGain >= 60000;
  }

  private setCooldown(userId: string, guildId: string): void {
    const key = `${userId}-${guildId}`;
    this.cooldowns.set(key, Date.now());
  }

  calculateLevel(xp: number): number {
    return Math.floor(Math.sqrt(xp / 100));
  }

  calculateXPForLevel(level: number): number {
    return level * level * 100;
  }

  calculateXPForNextLevel(currentXp: number): { current: number; needed: number; total: number } {
    const currentLevel = this.calculateLevel(currentXp);
    const nextLevel = currentLevel + 1;
    const xpForCurrentLevel = this.calculateXPForLevel(currentLevel);
    const xpForNextLevel = this.calculateXPForLevel(nextLevel);
    
    return {
      current: currentXp - xpForCurrentLevel,
      needed: xpForNextLevel - currentXp,
      total: xpForNextLevel - xpForCurrentLevel
    };
  }

  async setMultiplier(
    guildId: string,
    multiplier: Omit<XPMultiplier, 'startTime' | 'endTime'> & { duration?: number }
  ): Promise<void> {
    const guildMultipliers = this.multipliers.get(guildId) || [];
    const now = Date.now();
    
    const newMultiplier: XPMultiplier = {
      ...multiplier,
      startTime: now,
      endTime: multiplier.duration ? now + multiplier.duration : undefined
    };

    guildMultipliers.push(newMultiplier);
    this.multipliers.set(guildId, guildMultipliers);

    await db.query('saveMultiplier', async (client) => {
      return client.xpMultiplier.create({
        data: {
          guildId,
          type: newMultiplier.type,
          identifier: newMultiplier.identifier,
          multiplier: newMultiplier.multiplier,
          startTime: new Date(newMultiplier.startTime!),
          endTime: newMultiplier.endTime ? new Date(newMultiplier.endTime) : null
        }
      });
    });

    this.emit('multiplierSet', guildId, newMultiplier);
  }

  async removeMultiplier(guildId: string, type: string, identifier: string): Promise<void> {
    const guildMultipliers = this.multipliers.get(guildId) || [];
    const filtered = guildMultipliers.filter(m => !(m.type === type && m.identifier === identifier));
    this.multipliers.set(guildId, filtered);

    await db.query('removeMultiplier', async (client) => {
      return client.xpMultiplier.deleteMany({
        where: {
          guildId,
          type,
          identifier
        }
      });
    });

    this.emit('multiplierRemoved', guildId, type, identifier);
  }

  async setLevelReward(guildId: string, level: number, reward: Omit<LevelReward, 'level'>): Promise<void> {
    const guildRewards = this.levelRewards.get(guildId) || [];
    const existingIndex = guildRewards.findIndex(r => r.level === level);
    
    const newReward: LevelReward = { level, ...reward };
    
    if (existingIndex >= 0) {
      guildRewards[existingIndex] = newReward;
    } else {
      guildRewards.push(newReward);
      guildRewards.sort((a, b) => a.level - b.level);
    }
    
    this.levelRewards.set(guildId, guildRewards);

    await db.query('saveLevelReward', async (client) => {
      return client.levelReward.upsert({
        where: {
          guildId_level: { guildId, level }
        },
        update: {
          roleId: reward.roleId,
          xpBonus: reward.xpBonus,
          announcement: reward.announcement
        },
        create: {
          guildId,
          level,
          roleId: reward.roleId,
          xpBonus: reward.xpBonus,
          announcement: reward.announcement
        }
      });
    });
  }

  private async checkLevelRewards(guildId: string, level: number): Promise<LevelReward[]> {
    const guildRewards = this.levelRewards.get(guildId) || [];
    return guildRewards.filter(reward => reward.level === level);
  }

  async resetGuildXP(guildId: string, monthly: boolean = false): Promise<number> {
    const updateData = monthly 
      ? { monthlyXp: 0, lastReset: new Date() }
      : { xp: 0, level: 0, monthlyXp: 0, totalXp: 0, lastReset: new Date() };

    const result = await db.query('resetGuildXP', async (client) => {
      return client.user.updateMany({
        where: { guildId },
        data: updateData
      });
    });

    this.invalidateAllCaches(guildId);
    this.emit('guildXPReset', guildId, monthly);

    return result.count;
  }

  async resetUserXP(userId: string, guildId: string, total: boolean = false): Promise<boolean> {
    try {
      const updateData: any = {
        xp: 0,
        level: 0,
        monthlyXp: 0
      };

      if (total) {
        updateData.totalXp = 0;
        updateData.lastReset = new Date();
      }

      await db.query('resetUserXP', async (client) => {
        return client.user.update({
          where: { id_guildId: { id: userId, guildId } },
          data: updateData
        });
      });

      this.invalidateUserCache(userId, guildId);
      this.invalidateLeaderboardCache(guildId);
      this.emit('userXPReset', userId, guildId, total);

      return true;
    } catch (error) {
      console.error('Error resetting user XP:', error);
      return false;
    }
  }

  async freezeUser(userId: string, guildId: string, frozenBy: string, duration?: number): Promise<boolean> {
    try {
      const frozenUntil = duration ? new Date(Date.now() + duration) : null;

      await db.query('freezeUser', async (client) => {
        return client.user.update({
          where: { id_guildId: { id: userId, guildId } },
          data: {
            frozen: true,
            frozenBy,
            frozenUntil
          }
        });
      });

      this.invalidateUserCache(userId, guildId);
      this.emit('userFrozen', userId, guildId, frozenBy, duration);

      return true;
    } catch (error) {
      console.error('Error freezing user:', error);
      return false;
    }
  }

  async unfreezeUser(userId: string, guildId: string): Promise<boolean> {
    try {
      await db.query('unfreezeUser', async (client) => {
        return client.user.update({
          where: { id_guildId: { id: userId, guildId } },
          data: {
            frozen: false,
            frozenBy: null,
            frozenUntil: null
          }
        });
      });

      this.invalidateUserCache(userId, guildId);
      this.emit('userUnfrozen', userId, guildId);

      return true;
    } catch (error) {
      console.error('Error unfreezing user:', error);
      return false;
    }
  }

  private async isXPEnabled(guildId: string): Promise<boolean> {
    const settings = await this.getGuildSettings(guildId);
    return settings.xpEnabled;
  }

  private async isUserFrozen(userId: string, guildId: string): Promise<boolean> {
    const user = await db.query('checkUserFrozen', async (client) => {
      return client.user.findUnique({
        where: { id_guildId: { id: userId, guildId } },
        select: { frozen: true, frozenUntil: true }
      });
    }, { 
      readOnly: true,
      cache: { key: `frozen-${userId}-${guildId}`, ttl: 300000 }
    });

    if (!user?.frozen) return false;
    
    if (user.frozenUntil && new Date() > user.frozenUntil) {
      await this.unfreezeUser(userId, guildId);
      return false;
    }

    return true;
  }

  private async getGuildSettings(guildId: string): Promise<any> {
    return await db.query('getGuildSettings', async (client) => {
      return client.guild.findUnique({
        where: { id: guildId },
        select: {
          xpEnabled: true,
          xpMin: true,
          xpMax: true,
          xpRate: true
        }
      });
    }, { 
      readOnly: true,
      cache: { key: `guild-settings-${guildId}`, ttl: 600000 }
    }) || {
      xpEnabled: true,
      xpMin: 15,
      xpMax: 25,
      xpRate: 1.0
    };
  }

  private async loadMultipliers(): Promise<void> {
    const multipliers = await db.query('loadMultipliers', async (client) => {
      return client.xpMultiplier.findMany({
        where: {
          OR: [
            { endTime: null },
            { endTime: { gt: new Date() } }
          ]
        }
      });
    }, { readOnly: true });

    for (const multiplier of multipliers) {
      const guildMultipliers = this.multipliers.get(multiplier.guildId) || [];
      guildMultipliers.push({
        type: multiplier.type as any,
        identifier: multiplier.identifier,
        multiplier: multiplier.multiplier,
        startTime: multiplier.startTime.getTime(),
        endTime: multiplier.endTime?.getTime()
      });
      this.multipliers.set(multiplier.guildId, guildMultipliers);
    }
  }

  private invalidateUserCache(userId: string, guildId: string): void {
    const cacheKey = `${userId}-${guildId}`;
    this.userStatsCache.delete(cacheKey);
    performanceManager.invalidateCache(`user-stats-${userId}-${guildId}`);
    performanceManager.invalidateCache(`rank-${userId}-${guildId}-*`);
  }

  private invalidateLeaderboardCache(guildId: string): void {
    for (const [key] of this.leaderboardCache) {
      if (key.startsWith(guildId)) {
        this.leaderboardCache.delete(key);
      }
    }
    performanceManager.invalidateCache(`${guildId}-*`);
  }

  private invalidateAllCaches(guildId: string): void {
    for (const [key] of this.userStatsCache) {
      if (key.endsWith(`-${guildId}`)) {
        this.userStatsCache.delete(key);
      }
    }
    this.invalidateLeaderboardCache(guildId);
    performanceManager.invalidateCache(`*${guildId}*`);
  }

  private startCacheCleanup(): void {
    setInterval(() => {
      const now = Date.now();
      
      for (const [key, cache] of this.userStatsCache) {
        if (now - cache.timestamp > 600000) {
          this.userStatsCache.delete(key);
        }
      }
      
      for (const [key, cache] of this.leaderboardCache) {
        if (now - cache.timestamp > 300000) {
          this.leaderboardCache.delete(key);
        }
      }

      for (const [key, timestamp] of this.cooldowns) {
        if (now - timestamp > 300000) {
          this.cooldowns.delete(key);
        }
      }

      for (const [guildId, multipliers] of this.multipliers) {
        const activeMultipliers = multipliers.filter(m => 
          !m.endTime || m.endTime > now
        );
        if (activeMultipliers.length !== multipliers.length) {
          this.multipliers.set(guildId, activeMultipliers);
        }
      }
    }, 300000);
  }

  async getSystemMetrics(): Promise<any> {
    return {
      batchSize: this.xpBatch.length,
      cooldowns: this.cooldowns.size,
      userStatsCache: this.userStatsCache.size,
      leaderboardCache: this.leaderboardCache.size,
      activeMultipliers: Array.from(this.multipliers.values()).reduce((sum, arr) => sum + arr.length, 0),
      totalLevelRewards: Array.from(this.levelRewards.values()).reduce((sum, arr) => sum + arr.length, 0)
    };
  }

  destroy(): void {
    if (this.batchProcessingInterval) {
      clearInterval(this.batchProcessingInterval);
    }
    this.processBatch();
  }
}

export const optimizedXPSystem = new OptimizedXPSystem();