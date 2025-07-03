import { 
  SlashCommandBuilder, 
  ChatInputCommandInteraction, 
  EmbedBuilder,
  version as djsVersion
} from 'discord.js';
import { prisma } from '../../utils/database';
import { getUserLanguage, t } from '../../utils/i18n';
import * as os from 'os';

export const data = new SlashCommandBuilder()
  .setName('stats')
  .setDescription('View bot and server statistics')
  .addSubcommand(subcommand =>
    subcommand
      .setName('bot')
      .setDescription('View bot resource usage and statistics')
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('server')
      .setDescription('View server insights and statistics')
      .addStringOption(option =>
        option
          .setName('type')
          .setDescription('Type of statistics to view')
          .setRequired(false)
          .addChoices(
            { name: 'Overview', value: 'overview' },
            { name: 'XP Statistics', value: 'xp' },
            { name: 'Member Activity', value: 'activity' },
            { name: 'Moderation', value: 'moderation' },
            { name: 'Tickets', value: 'tickets' }
          )
      )
  );

export const category = 'admin';
export const adminOnly = true;

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) {
    await interaction.reply({
      content: 'This command can only be used in a server.',
      ephemeral: true
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const subcommand = interaction.options.getSubcommand();
  const userLang = await getUserLanguage(interaction.user.id, interaction.guild.id);

  if (subcommand === 'bot') {
    await handleBotStats(interaction, userLang);
  } else if (subcommand === 'server') {
    const type = interaction.options.getString('type') || 'overview';
    await handleServerStats(interaction, type, userLang);
  }
}

async function handleBotStats(interaction: ChatInputCommandInteraction, userLang: string) {
  const client = interaction.client;
  const uptime = process.uptime();
  const memUsage = process.memoryUsage();
  const cpuUsage = process.cpuUsage();
  
  const totalGuilds = client.guilds.cache.size;
  const totalUsers = client.users.cache.size;
  const totalChannels = client.channels.cache.size;
  
  const totalCommands = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*) as count FROM "XPHistory" WHERE "createdAt" > NOW() - INTERVAL '24 hours'
  `;
  const commandsToday = Number(totalCommands[0].count);

  const embed = new EmbedBuilder()
    .setTitle('🤖 Bot Statistics')
    .setColor('#7289da')
    .setTimestamp()
    .setThumbnail(client.user?.displayAvatarURL() || null);

  embed.addFields(
    {
      name: '📊 Bot Stats',
      value: [
        `**Servers:** ${totalGuilds}`,
        `**Users:** ${totalUsers}`,
        `**Channels:** ${totalChannels}`,
        `**Commands (24h):** ${commandsToday}`
      ].join('\n'),
      inline: true
    },
    {
      name: '⚡ Performance',
      value: [
        `**Uptime:** ${formatUptime(uptime)}`,
        `**Memory:** ${(memUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`,
        `**Total Memory:** ${(memUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`,
        `**CPU Time:** ${(cpuUsage.user / 1000000).toFixed(2)}s`
      ].join('\n'),
      inline: true
    },
    {
      name: '🖥️ System',
      value: [
        `**Node.js:** ${process.version}`,
        `**Discord.js:** v${djsVersion}`,
        `**Platform:** ${os.platform()}`,
        `**Arch:** ${os.arch()}`
      ].join('\n'),
      inline: true
    }
  );

  const totalRam = os.totalmem() / 1024 / 1024 / 1024;
  const freeRam = os.freemem() / 1024 / 1024 / 1024;
  const usedRam = totalRam - freeRam;
  const cpuCores = os.cpus().length;

  embed.addFields(
    {
      name: '💾 Host System',
      value: [
        `**CPU Cores:** ${cpuCores}`,
        `**RAM:** ${usedRam.toFixed(2)} / ${totalRam.toFixed(2)} GB`,
        `**Load Average:** ${os.loadavg().map(l => l.toFixed(2)).join(', ')}`,
        `**Hostname:** ${os.hostname()}`
      ].join('\n'),
      inline: false
    }
  );

  const dbStats = await prisma.$queryRaw<[{ 
    users: bigint, 
    guilds: bigint, 
    tickets: bigint,
    polls: bigint 
  }]>`
    SELECT 
      (SELECT COUNT(*) FROM "User") as users,
      (SELECT COUNT(*) FROM "Guild") as guilds,
      (SELECT COUNT(*) FROM "Ticket") as tickets,
      (SELECT COUNT(*) FROM "Poll") as polls
  `;

  embed.addFields({
    name: '🗄️ Database',
    value: [
      `**Total Users:** ${Number((dbStats[0] as any).users)}`,
      `**Total Guilds:** ${Number((dbStats[0] as any).guilds)}`,
      `**Total Tickets:** ${Number((dbStats[0] as any).tickets)}`,
      `**Total Polls:** ${Number((dbStats[0] as any).polls)}`
    ].join('\n'),
    inline: false
  });

  await interaction.editReply({ embeds: [embed] });
}

async function handleServerStats(interaction: ChatInputCommandInteraction, type: string, userLang: string) {
  const guildId = interaction.guild!.id;

  switch (type) {
    case 'overview':
      await showOverviewStats(interaction, guildId, userLang);
      break;
    case 'xp':
      await showXPStats(interaction, guildId, userLang);
      break;
    case 'activity':
      await showActivityStats(interaction, guildId, userLang);
      break;
    case 'moderation':
      await showModerationStats(interaction, guildId, userLang);
      break;
    case 'tickets':
      await showTicketStats(interaction, guildId, userLang);
      break;
  }
}

async function showOverviewStats(interaction: ChatInputCommandInteraction, guildId: string, userLang: string) {
  const guild = interaction.guild!;
  
  const [userCount, xpStats, ticketCount, pollCount] = await Promise.all([
    prisma.user.count({ where: { guildId } }),
    prisma.user.aggregate({
      where: { guildId },
      _sum: { totalXp: true },
      _avg: { level: true }
    }),
    prisma.ticket.count({ where: { guildId } }),
    prisma.poll.count({ where: { guildId } })
  ]);

  const embed = new EmbedBuilder()
    .setTitle(`📊 ${guild.name} - Overview`)
    .setColor('#7289da')
    .setThumbnail(guild.iconURL() || null)
    .setTimestamp();

  const createdDays = Math.floor((Date.now() - guild.createdTimestamp) / (1000 * 60 * 60 * 24));

  embed.addFields(
    {
      name: '🏛️ Server Info',
      value: [
        `**Members:** ${guild.memberCount}`,
        `**Channels:** ${guild.channels.cache.size}`,
        `**Roles:** ${guild.roles.cache.size}`,
        `**Created:** ${createdDays} days ago`
      ].join('\n'),
      inline: true
    },
    {
      name: '📈 Bot Usage',
      value: [
        `**Users in DB:** ${userCount}`,
        `**Total XP:** ${xpStats._sum.totalXp?.toLocaleString() || 0}`,
        `**Avg Level:** ${xpStats._avg.level?.toFixed(1) || 0}`,
        `**Total Tickets:** ${ticketCount}`,
        `**Total Polls:** ${pollCount}`
      ].join('\n'),
      inline: true
    },
    {
      name: '🎭 Features',
      value: [
        `**Boost Level:** ${guild.premiumTier}`,
        `**Boosts:** ${guild.premiumSubscriptionCount || 0}`,
        `**Verification:** ${guild.verificationLevel}`,
        `**2FA Required:** ${guild.mfaLevel ? 'Yes' : 'No'}`
      ].join('\n'),
      inline: true
    }
  );

  await interaction.editReply({ embeds: [embed] });
}

async function showXPStats(interaction: ChatInputCommandInteraction, guildId: string, userLang: string) {
  const [
    totalUsers,
    activeUsers,
    xpGainedToday,
    topLevel,
    levelDistribution
  ] = await Promise.all([
    prisma.user.count({ where: { guildId } }),
    prisma.user.count({ 
      where: { 
        guildId,
        lastMessage: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
      } 
    }),
    prisma.xPHistory.aggregate({
      where: {
        guildId,
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      },
      _sum: { xpGained: true }
    }),
    prisma.user.findFirst({
      where: { guildId },
      orderBy: { level: 'desc' },
      select: { level: true, username: true }
    }),
    prisma.$queryRaw<{ level: number; count: bigint }[]>`
      SELECT level, COUNT(*) as count 
      FROM "User" 
      WHERE "guildId" = ${guildId} AND level > 0
      GROUP BY level 
      ORDER BY level DESC 
      LIMIT 10
    `
  ]);

  const embed = new EmbedBuilder()
    .setTitle('📊 XP Statistics')
    .setColor('#ffd700')
    .setTimestamp();

  embed.addFields(
    {
      name: '👥 User Activity',
      value: [
        `**Total Users:** ${totalUsers}`,
        `**Active (7d):** ${activeUsers}`,
        `**Activity Rate:** ${((activeUsers / totalUsers) * 100).toFixed(1)}%`
      ].join('\n'),
      inline: true
    },
    {
      name: '✨ XP Gains',
      value: [
        `**XP Today:** ${xpGainedToday._sum.xpGained?.toLocaleString() || 0}`,
        `**Highest Level:** ${topLevel?.level || 0}`,
        `**Top User:** ${topLevel?.username || 'None'}`
      ].join('\n'),
      inline: true
    }
  );

  if (levelDistribution.length > 0) {
    const levelText = levelDistribution
      .slice(0, 5)
      .map(ld => `Level ${ld.level}: ${Number(ld.count)} users`)
      .join('\n');

    embed.addFields({
      name: '📈 Level Distribution',
      value: levelText || 'No data',
      inline: false
    });
  }

  await interaction.editReply({ embeds: [embed] });
}

async function showActivityStats(interaction: ChatInputCommandInteraction, guildId: string, userLang: string) {
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [
    messagesDay,
    messagesWeek,
    uniqueUsersDay,
    uniqueUsersWeek,
    mostActiveHour
  ] = await Promise.all([
    prisma.xPHistory.count({
      where: {
        guildId,
        createdAt: { gte: dayAgo },
        reason: 'message'
      }
    }),
    prisma.xPHistory.count({
      where: {
        guildId,
        createdAt: { gte: weekAgo },
        reason: 'message'
      }
    }),
    prisma.xPHistory.groupBy({
      by: ['userId'],
      where: {
        guildId,
        createdAt: { gte: dayAgo }
      },
      _count: true
    }),
    prisma.xPHistory.groupBy({
      by: ['userId'],
      where: {
        guildId,
        createdAt: { gte: weekAgo }
      },
      _count: true
    }),
    prisma.$queryRaw<{ hour: number; count: bigint }[]>`
      SELECT EXTRACT(HOUR FROM "createdAt") as hour, COUNT(*) as count
      FROM "XPHistory"
      WHERE "guildId" = ${guildId} 
        AND "createdAt" >= ${weekAgo}
        AND reason = 'message'
      GROUP BY hour
      ORDER BY count DESC
      LIMIT 1
    `
  ]);

  const embed = new EmbedBuilder()
    .setTitle('📈 Member Activity')
    .setColor('#00ff00')
    .setTimestamp();

  embed.addFields(
    {
      name: '📅 Daily Stats',
      value: [
        `**Messages:** ${messagesDay}`,
        `**Active Users:** ${uniqueUsersDay.length}`,
        `**Avg per User:** ${(messagesDay / Math.max(uniqueUsersDay.length, 1)).toFixed(1)}`
      ].join('\n'),
      inline: true
    },
    {
      name: '📊 Weekly Stats',
      value: [
        `**Messages:** ${messagesWeek}`,
        `**Active Users:** ${uniqueUsersWeek.length}`,
        `**Avg per User:** ${(messagesWeek / Math.max(uniqueUsersWeek.length, 1)).toFixed(1)}`
      ].join('\n'),
      inline: true
    }
  );

  if (mostActiveHour.length > 0) {
    embed.addFields({
      name: '🕐 Peak Activity',
      value: `Most active at **${mostActiveHour[0].hour}:00** with ${Number(mostActiveHour[0].count)} messages`,
      inline: false
    });
  }

  await interaction.editReply({ embeds: [embed] });
}

async function showModerationStats(interaction: ChatInputCommandInteraction, guildId: string, userLang: string) {
  const [
    totalWarns,
    activeWarns,
    totalBans,
    totalKicks,
    totalTimeouts,
    recentActions
  ] = await Promise.all([
    prisma.warn.count({ where: { guildId } }),
    prisma.warn.count({ 
      where: { 
        guildId, 
        active: true,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } }
        ]
      } 
    }),
    prisma.modAction.count({ where: { guildId, action: 'ban' } }),
    prisma.modAction.count({ where: { guildId, action: 'kick' } }),
    prisma.modAction.count({ where: { guildId, action: 'timeout' } }),
    prisma.modAction.count({
      where: {
        guildId,
        createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
      }
    })
  ]);

  const topModerators = await prisma.modAction.groupBy({
    by: ['moderatorId'],
    where: { guildId },
    _count: true,
    orderBy: { _count: { moderatorId: 'desc' } },
    take: 3
  });

  const embed = new EmbedBuilder()
    .setTitle('🔨 Moderation Statistics')
    .setColor('#ff0000')
    .setTimestamp();

  embed.addFields(
    {
      name: '⚠️ Warnings',
      value: [
        `**Total Warnings:** ${totalWarns}`,
        `**Active Warnings:** ${activeWarns}`,
        `**Expired:** ${totalWarns - activeWarns}`
      ].join('\n'),
      inline: true
    },
    {
      name: '🔧 Actions',
      value: [
        `**Bans:** ${totalBans}`,
        `**Kicks:** ${totalKicks}`,
        `**Timeouts:** ${totalTimeouts}`,
        `**Recent (7d):** ${recentActions}`
      ].join('\n'),
      inline: true
    }
  );

  if (topModerators.length > 0) {
    const modText = await Promise.all(
      topModerators.map(async (mod) => {
        const user = await interaction.client.users.fetch(mod.moderatorId).catch(() => null);
        return `${user?.tag || 'Unknown'}: ${mod._count} actions`;
      })
    );

    embed.addFields({
      name: '👮 Top Moderators',
      value: modText.join('\n'),
      inline: false
    });
  }

  await interaction.editReply({ embeds: [embed] });
}

async function showTicketStats(interaction: ChatInputCommandInteraction, guildId: string, userLang: string) {
  const [
    totalTickets,
    openTickets,
    closedTickets,
    avgResponseTime,
    ticketSystems
  ] = await Promise.all([
    prisma.ticket.count({ where: { guildId } }),
    prisma.ticket.count({ where: { guildId, status: 'open' } }),
    prisma.ticket.count({ where: { guildId, status: 'closed' } }),
    prisma.ticket.aggregate({
      where: { 
        guildId, 
        status: 'closed',
        closedAt: { not: null }
      },
      _avg: {
        id: true
      }
    }),
    prisma.ticketSystem.findMany({
      where: { guildId },
      include: {
        _count: { select: { tickets: true } }
      }
    })
  ]);

  const embed = new EmbedBuilder()
    .setTitle('🎫 Ticket Statistics')
    .setColor('#00ff99')
    .setTimestamp();

  embed.addFields(
    {
      name: '📊 Overview',
      value: [
        `**Total Tickets:** ${totalTickets}`,
        `**Open:** ${openTickets}`,
        `**Closed:** ${closedTickets}`,
        `**Systems:** ${ticketSystems.length}`
      ].join('\n'),
      inline: true
    }
  );

  if (ticketSystems.length > 0) {
    const systemText = ticketSystems
      .map(sys => `**${sys.name}:** ${sys._count.tickets} tickets`)
      .join('\n');

    embed.addFields({
      name: '🎯 Ticket Systems',
      value: systemText,
      inline: false
    });
  }

  await interaction.editReply({ embeds: [embed] });
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  
  return parts.join(' ') || '0m';
}