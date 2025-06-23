import { PrismaClient } from '@prisma/client';
import { GuildSettings } from '../types';

export const prisma = new PrismaClient({
  log: ['warn', 'error'],
});

export async function initializeDatabase() {
  try {
    await prisma.$connect();
    console.log('✅ Database connected successfully');
    
    // Test the connection
    await prisma.$queryRaw`SELECT 1`;
    console.log('✅ Database query test successful');
    
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    throw error;
  }
}

export async function ensureGuild(guildId: string): Promise<GuildSettings> {
  const guild = await prisma.guild.upsert({
    where: { id: guildId },
    update: {},
    create: { 
      id: guildId,
      language: 'en',
      xpEnabled: true,
      xpMin: parseInt(process.env.XP_MIN || '15'),
      xpMax: parseInt(process.env.XP_MAX || '25'),
      xpCooldown: parseInt(process.env.XP_COOLDOWN || '60000'),
      xpRate: parseFloat(process.env.XP_RATE || '1.0')
    },
    include: {
      levelRoles: true
    }
  });

  return {
    id: guild.id,
    language: guild.language,
    xpEnabled: guild.xpEnabled,
    xpMin: guild.xpMin,
    xpMax: guild.xpMax,
    xpCooldown: guild.xpCooldown,
    xpRate: guild.xpRate,
    levelRoles: guild.levelRoles
  };
}

export async function ensureUser(userId: string, guildId: string, username?: string) {
  return await prisma.user.upsert({
    where: { 
      id_guildId: {
        id: userId,
        guildId: guildId
      }
    },
    update: {
      username: username || undefined,
      updatedAt: new Date()
    },
    create: { 
      id: userId,
      guildId: guildId,
      username: username || '',
      xp: 0,
      level: 0,
      totalXp: 0,
      monthlyXp: 0
    }
  });
}

export async function getGuildSettings(guildId: string): Promise<GuildSettings | null> {
  const guild = await prisma.guild.findUnique({
    where: { id: guildId },
    include: {
      levelRoles: true
    }
  });

  if (!guild) return null;

  return {
    id: guild.id,
    language: guild.language,
    xpEnabled: guild.xpEnabled,
    xpMin: guild.xpMin,
    xpMax: guild.xpMax,
    xpCooldown: guild.xpCooldown,
    xpRate: guild.xpRate,
    levelRoles: guild.levelRoles
  };
}

export async function updateGuildSettings(guildId: string, settings: Partial<GuildSettings>) {
  return await prisma.guild.update({
    where: { id: guildId },
    data: {
      language: settings.language,
      xpEnabled: settings.xpEnabled,
      xpMin: settings.xpMin,
      xpMax: settings.xpMax,
      xpCooldown: settings.xpCooldown,
      xpRate: settings.xpRate,
      updatedAt: new Date()
    }
  });
}

export async function getUserInGuild(userId: string, guildId: string) {
  return await prisma.user.findUnique({
    where: {
      id_guildId: {
        id: userId,
        guildId: guildId
      }
    }
  });
}

export async function getAllUserGuilds(userId: string) {
  return await prisma.user.findMany({
    where: { id: userId },
    include: {
      guild: true
    }
  });
}

export async function getTopUsersInGuild(guildId: string, limit: number = 10, monthly: boolean = false) {
  const orderBy = monthly ? { monthlyXp: 'desc' } : { xp: 'desc' };
  
  return await prisma.user.findMany({
    where: { 
      guildId: guildId,
      ...(monthly ? { monthlyXp: { gt: 0 } } : { xp: { gt: 0 } })
    },
    orderBy: orderBy as any,
    take: limit
  });
}

export async function resetMonthlyXP(guildId: string) {
  const userCount = await prisma.user.count({
    where: { guildId: guildId }
  });

  await prisma.$transaction([
    prisma.user.updateMany({
      where: { guildId: guildId },
      data: { 
        monthlyXp: 0,
        lastReset: new Date()
      }
    }),
    prisma.monthlyReset.create({
      data: {
        guildId: guildId,
        userCount: userCount,
        resetDate: new Date()
      }
    })
  ]);

  return userCount;
}

export async function resetUserXP(userId: string, guildId: string, total: boolean = false) {
  const updateData: any = {
    xp: 0,
    level: 0,
    monthlyXp: 0,
    updatedAt: new Date()
  };

  if (total) {
    updateData.totalXp = 0;
    updateData.lastReset = new Date();
  }

  return await prisma.user.update({
    where: {
      id_guildId: {
        id: userId,
        guildId: guildId
      }
    },
    data: updateData
  });
}

export async function freezeUser(userId: string, guildId: string, frozenBy: string, duration?: number) {
  const frozenUntil = duration ? new Date(Date.now() + duration) : null;

  return await prisma.user.update({
    where: {
      id_guildId: {
        id: userId,
        guildId: guildId
      }
    },
    data: {
      frozen: true,
      frozenBy: frozenBy,
      frozenUntil: frozenUntil,
      updatedAt: new Date()
    }
  });
}

export async function unfreezeUser(userId: string, guildId: string) {
  return await prisma.user.update({
    where: {
      id_guildId: {
        id: userId,
        guildId: guildId
      }
    },
    data: {
      frozen: false,
      frozenBy: null,
      frozenUntil: null,
      updatedAt: new Date()
    }
  });
}

export async function addLevelRole(guildId: string, level: number, roleId: string) {
  return await prisma.levelRole.create({
    data: {
      guildId: guildId,
      level: level,
      roleId: roleId
    }
  });
}

export async function removeLevelRole(guildId: string, level: number) {
  return await prisma.levelRole.delete({
    where: {
      guildId_level: {
        guildId: guildId,
        level: level
      }
    }
  });
}

export async function getLevelRoles(guildId: string) {
  return await prisma.levelRole.findMany({
    where: { guildId: guildId },
    orderBy: { level: 'asc' }
  });
}