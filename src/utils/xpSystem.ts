import { prisma, getGuildSettings, ensureUser } from './database';
import { XPGainReason, UserStats, LeaderboardEntry } from '../types';
import { Guild, GuildMember } from 'discord.js';

export class XPSystem {
  private static cooldowns = new Map<string, number>();

  static async gainXP(
    userId: string, 
    guildId: string, 
    username: string,
    reason: XPGainReason = XPGainReason.MESSAGE,
    customAmount?: number
  ): Promise<{ gained: number; levelUp: boolean; newLevel?: number } | null> {
    
    // Get guild settings
    const guildSettings = await getGuildSettings(guildId);
    if (!guildSettings || !guildSettings.xpEnabled) {
      return null;
    }

    // Check if user is frozen
    const user = await prisma.user.findUnique({
      where: {
        id_guildId: { id: userId, guildId: guildId }
      }
    });

    if (user?.frozen) {
      // Check if freeze has expired
      if (user.frozenUntil && new Date() > user.frozenUntil) {
        await prisma.user.update({
          where: {
            id_guildId: { id: userId, guildId: guildId }
          },
          data: {
            frozen: false,
            frozenBy: null,
            frozenUntil: null
          }
        });
      } else {
        return null; // Still frozen
      }
    }

    // Check cooldown (only for message XP)
    if (reason === XPGainReason.MESSAGE) {
      const cooldownKey = `${userId}-${guildId}`;
      const lastGain = this.cooldowns.get(cooldownKey) || 0;
      const now = Date.now();
      
      if (now - lastGain < guildSettings.xpCooldown) {
        return null;
      }
      
      this.cooldowns.set(cooldownKey, now);
    }

    // Calculate XP gain
    let xpGain: number;
    if (customAmount !== undefined) {
      xpGain = Math.floor(customAmount * guildSettings.xpRate);
    } else {
      const baseXp = Math.floor(
        Math.random() * (guildSettings.xpMax - guildSettings.xpMin + 1) + guildSettings.xpMin
      );
      xpGain = Math.floor(baseXp * guildSettings.xpRate);
    }

    // Ensure user exists
    await ensureUser(userId, guildId, username);

    // Get current user data
    const currentUser = await prisma.user.findUnique({
      where: {
        id_guildId: { id: userId, guildId: guildId }
      }
    });

    if (!currentUser) return null;

    const oldLevel = currentUser.level;
    const newXp = currentUser.xp + xpGain;
    const newLevel = this.calculateLevel(newXp);
    const levelUp = newLevel > oldLevel;

    // Update user data
    await prisma.user.update({
      where: {
        id_guildId: { id: userId, guildId: guildId }
      },
      data: {
        xp: newXp,
        level: newLevel,
        totalXp: currentUser.totalXp + xpGain,
        monthlyXp: currentUser.monthlyXp + xpGain,
        lastMessage: new Date(),
        username: username
      }
    });

    // Log XP history
    await prisma.xPHistory.create({
      data: {
        userId: userId,
        guildId: guildId,
        xpGained: xpGain,
        reason: reason
      }
    });

    return {
      gained: xpGain,
      levelUp: levelUp,
      newLevel: levelUp ? newLevel : undefined
    };
  }

  static calculateLevel(xp: number): number {
    // Using a square root based leveling system
    // Level = floor(sqrt(xp / 100))
    return Math.floor(Math.sqrt(xp / 100));
  }

  static calculateXPForLevel(level: number): number {
    // XP needed for a specific level
    return level * level * 100;
  }

  static calculateXPForNextLevel(currentXp: number): { current: number; needed: number; total: number } {
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

  static async getUserStats(userId: string, guildId: string): Promise<UserStats | null> {
    const user = await prisma.user.findUnique({
      where: {
        id_guildId: { id: userId, guildId: guildId }
      }
    });

    if (!user) return null;

    // Get total rank
    const totalRank = await prisma.user.count({
      where: {
        guildId: guildId,
        xp: { gt: user.xp }
      }
    }) + 1;

    // Get monthly rank
    const monthlyRank = await prisma.user.count({
      where: {
        guildId: guildId,
        monthlyXp: { gt: user.monthlyXp }
      }
    }) + 1;

    return {
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
  }

  static async getLeaderboard(
    guildId: string, 
    limit: number = 10, 
    monthly: boolean = false
  ): Promise<LeaderboardEntry[]> {
    const users = await prisma.user.findMany({
      where: {
        guildId: guildId,
        ...(monthly ? { monthlyXp: { gt: 0 } } : { xp: { gt: 0 } })
      },
      orderBy: monthly ? { monthlyXp: 'desc' } : { xp: 'desc' },
      take: limit
    });

    return users.map((user, index) => ({
      userId: user.id,
      username: user.username || `User#${user.id.slice(-4)}`,
      xp: monthly ? user.monthlyXp : user.xp,
      level: user.level,
      rank: index + 1
    }));
  }

  static async checkLevelRoles(
    member: GuildMember, 
    oldLevel: number, 
    newLevel: number
  ): Promise<string[]> {
    const addedRoles: string[] = [];
    
    try {
      const levelRoles = await prisma.levelRole.findMany({
        where: {
          guildId: member.guild.id,
          level: { lte: newLevel, gt: oldLevel }
        },
        orderBy: { level: 'asc' }
      });

      for (const levelRole of levelRoles) {
        try {
          const role = member.guild.roles.cache.get(levelRole.roleId);
          if (role && !member.roles.cache.has(levelRole.roleId)) {
            await member.roles.add(role);
            addedRoles.push(role.name);
          }
        } catch (error) {
          console.error(`Error adding role ${levelRole.roleId} to user ${member.id}:`, error);
        }
      }
    } catch (error) {
      console.error('Error checking level roles:', error);
    }

    return addedRoles;
  }

  static async resetGuildXP(guildId: string, monthly: boolean = false): Promise<number> {
    const updateData = monthly 
      ? { monthlyXp: 0, lastReset: new Date() }
      : { xp: 0, level: 0, monthlyXp: 0, totalXp: 0, lastReset: new Date() };

    const result = await prisma.user.updateMany({
      where: { guildId: guildId },
      data: updateData
    });

    return result.count;
  }

  static async resetUserXP(
    userId: string, 
    guildId: string, 
    total: boolean = false
  ): Promise<boolean> {
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

      await prisma.user.update({
        where: {
          id_guildId: { id: userId, guildId: guildId }
        },
        data: updateData
      });

      return true;
    } catch (error) {
      console.error('Error resetting user XP:', error);
      return false;
    }
  }

  static async freezeUser(
    userId: string, 
    guildId: string, 
    frozenBy: string, 
    duration?: number
  ): Promise<boolean> {
    try {
      const frozenUntil = duration ? new Date(Date.now() + duration) : null;

      await prisma.user.update({
        where: {
          id_guildId: { id: userId, guildId: guildId }
        },
        data: {
          frozen: true,
          frozenBy: frozenBy,
          frozenUntil: frozenUntil
        }
      });

      return true;
    } catch (error) {
      console.error('Error freezing user:', error);
      return false;
    }
  }

  static async unfreezeUser(userId: string, guildId: string): Promise<boolean> {
    try {
      await prisma.user.update({
        where: {
          id_guildId: { id: userId, guildId: guildId }
        },
        data: {
          frozen: false,
          frozenBy: null,
          frozenUntil: null
        }
      });

      return true;
    } catch (error) {
      console.error('Error unfreezing user:', error);
      return false;
    }
  }
}