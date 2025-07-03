import { prisma } from './database';
import { Guild, GuildMember } from 'discord.js';
import * as cron from 'node-cron';

export class ModerationSystem {
  static async checkExpiredWarnings(guildId: string) {
    const expiredWarnings = await prisma.warn.findMany({
      where: {
        guildId: guildId,
        active: true,
        expiresAt: {
          not: null,
          lt: new Date()
        }
      }
    });

    for (const warning of expiredWarnings) {
      await prisma.warn.update({
        where: { id: warning.id },
        data: { active: false }
      });
    }

    return expiredWarnings.length;
  }

  static async checkExpiredTimeouts(guild: Guild) {
    const expiredTimeouts = await prisma.modAction.findMany({
      where: {
        guildId: guild.id,
        action: 'timeout',
        active: true,
        expiresAt: {
          not: null,
          lt: new Date()
        }
      }
    });

    for (const timeout of expiredTimeouts) {
      await prisma.modAction.update({
        where: { id: timeout.id },
        data: { active: false }
      });
    }

    return expiredTimeouts.length;
  }

  static async getActiveWarnings(userId: string, guildId: string) {
    return await prisma.warn.count({
      where: {
        userId: userId,
        guildId: guildId,
        active: true,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } }
        ]
      }
    });
  }

  static async getModHistory(userId: string, guildId: string, limit: number = 10) {
    const [warnings, actions] = await Promise.all([
      prisma.warn.findMany({
        where: {
          userId: userId,
          guildId: guildId
        },
        orderBy: { createdAt: 'desc' },
        take: limit
      }),
      prisma.modAction.findMany({
        where: {
          userId: userId,
          guildId: guildId
        },
        orderBy: { createdAt: 'desc' },
        take: limit
      })
    ]);

    const combined = [
      ...warnings.map(w => ({ ...w, type: 'warn' })),
      ...actions.map(a => ({ ...a, type: 'action' }))
    ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return combined.slice(0, limit);
  }

  static async getTotalModActions(userId: string, guildId: string) {
    const [warns, bans, kicks, timeouts] = await Promise.all([
      prisma.warn.count({
        where: {
          userId: userId,
          guildId: guildId
        }
      }),
      prisma.modAction.count({
        where: {
          userId: userId,
          guildId: guildId,
          action: 'ban'
        }
      }),
      prisma.modAction.count({
        where: {
          userId: userId,
          guildId: guildId,
          action: 'kick'
        }
      }),
      prisma.modAction.count({
        where: {
          userId: userId,
          guildId: guildId,
          action: 'timeout'
        }
      })
    ]);

    return {
      warns,
      bans,
      kicks,
      timeouts,
      total: warns + bans + kicks + timeouts
    };
  }

  static async checkAutomodThresholds(member: GuildMember) {
    const activeWarnings = await this.getActiveWarnings(member.id, member.guild.id);
    
    if (activeWarnings >= 5) {
      return {
        action: 'ban',
        reason: 'Exceeded warning threshold (5 active warnings)'
      };
    } else if (activeWarnings >= 3) {
      return {
        action: 'timeout',
        reason: 'Multiple warnings (3 active warnings)',
        duration: 24 * 60 * 60 * 1000
      };
    }

    return null;
  }

  static async logModeratorAction(
    moderatorId: string,
    guildId: string,
    action: string,
    targetId: string,
    reason?: string
  ) {
    const timestamp = new Date();
    console.log(`[MODLOG] ${timestamp.toISOString()} - Guild: ${guildId} - Moderator: ${moderatorId} - Action: ${action} - Target: ${targetId} - Reason: ${reason || 'No reason'}`);
  }

  static async getModeratorStats(moderatorId: string, guildId: string) {
    const [warnings, bans, kicks, timeouts] = await Promise.all([
      prisma.warn.count({
        where: {
          moderatorId: moderatorId,
          guildId: guildId
        }
      }),
      prisma.modAction.count({
        where: {
          moderatorId: moderatorId,
          guildId: guildId,
          action: 'ban'
        }
      }),
      prisma.modAction.count({
        where: {
          moderatorId: moderatorId,
          guildId: guildId,
          action: 'kick'
        }
      }),
      prisma.modAction.count({
        where: {
          moderatorId: moderatorId,
          guildId: guildId,
          action: 'timeout'
        }
      })
    ]);

    return {
      warnings,
      bans,
      kicks,
      timeouts,
      total: warnings + bans + kicks + timeouts
    };
  }
}

export function startModerationCron() {
  cron.schedule('*/5 * * * *', async () => {
    try {
      const guilds = await prisma.guild.findMany({
        select: { id: true }
      });

      for (const guild of guilds) {
        await ModerationSystem.checkExpiredWarnings(guild.id);
      }
    } catch (error) {
      console.error('Error in moderation cron job:', error);
    }
  });

  console.log('✅ Moderation cron job started (runs every 5 minutes)');
}