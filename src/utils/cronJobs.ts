import * as cron from 'node-cron';
import { prisma } from './database';

export function startMonthlyResetCron() {
  // Run every day at 00:00 UTC to check for 28-day cycles
  cron.schedule('0 0 * * *', async () => {
    console.log('🔄 Running daily check for monthly XP resets...');
    
    try {
      await checkAndResetMonthlyXP();
    } catch (error) {
      console.error('❌ Error during monthly XP reset check:', error);
    }
  });

  console.log('✅ Monthly reset cron job started (daily at 00:00 UTC)');
}

async function checkAndResetMonthlyXP() {
  // Get all guilds
  const guilds = await prisma.guild.findMany({
    select: { id: true }
  });

  let totalResets = 0;

  for (const guild of guilds) {
    try {
      const resetCount = await checkGuildForReset(guild.id);
      if (resetCount > 0) {
        totalResets++;
        console.log(`✅ Reset monthly XP for guild ${guild.id} (${resetCount} users)`);
      }
    } catch (error) {
      console.error(`❌ Error resetting XP for guild ${guild.id}:`, error);
    }
  }

  if (totalResets > 0) {
    console.log(`🎯 Monthly XP reset completed for ${totalResets} guilds`);
  } else {
    console.log('ℹ️  No guilds required monthly XP reset today');
  }
}

async function checkGuildForReset(guildId: string): Promise<number> {
  const now = new Date();
  const twentyEightDaysAgo = new Date(now.getTime() - (28 * 24 * 60 * 60 * 1000));

  // Check if any user in this guild has their lastReset older than 28 days
  const usersNeedingReset = await prisma.user.findMany({
    where: {
      guildId: guildId,
      lastReset: {
        lt: twentyEightDaysAgo
      },
      monthlyXp: {
        gt: 0
      }
    },
    select: { id: true }
  });

  if (usersNeedingReset.length === 0) {
    return 0;
  }

  // Check if we've already done a reset for this guild in the last 24 hours
  const recentReset = await prisma.monthlyReset.findFirst({
    where: {
      guildId: guildId,
      resetDate: {
        gte: new Date(now.getTime() - (24 * 60 * 60 * 1000))
      }
    }
  });

  if (recentReset) {
    return 0; // Already reset recently
  }

  // Perform the reset
  const userCount = await prisma.user.count({
    where: { guildId: guildId }
  });

  await prisma.$transaction([
    // Reset monthly XP for all users in the guild
    prisma.user.updateMany({
      where: { guildId: guildId },
      data: {
        monthlyXp: 0,
        lastReset: now
      }
    }),
    // Log the reset
    prisma.monthlyReset.create({
      data: {
        guildId: guildId,
        userCount: userCount,
        resetDate: now
      }
    })
  ]);

  return userCount;
}

// Manual reset function that can be called by commands
export async function manualMonthlyReset(guildId: string): Promise<number> {
  const now = new Date();
  
  const userCount = await prisma.user.count({
    where: { guildId: guildId }
  });

  await prisma.$transaction([
    prisma.user.updateMany({
      where: { guildId: guildId },
      data: {
        monthlyXp: 0,
        lastReset: now
      }
    }),
    prisma.monthlyReset.create({
      data: {
        guildId: guildId,
        userCount: userCount,
        resetDate: now
      }
    })
  ]);

  return userCount;
}

// Get time until next reset for a guild
export async function getTimeUntilNextReset(guildId: string): Promise<number> {
  const oldestUser = await prisma.user.findFirst({
    where: { guildId: guildId },
    orderBy: { lastReset: 'asc' },
    select: { lastReset: true }
  });

  if (!oldestUser) {
    return 0;
  }

  const nextResetTime = new Date(oldestUser.lastReset.getTime() + (28 * 24 * 60 * 60 * 1000));
  const now = new Date();
  
  return Math.max(0, nextResetTime.getTime() - now.getTime());
}

// Get reset history for a guild
export async function getResetHistory(guildId: string, limit: number = 10) {
  return await prisma.monthlyReset.findMany({
    where: { guildId: guildId },
    orderBy: { resetDate: 'desc' },
    take: limit
  });
}