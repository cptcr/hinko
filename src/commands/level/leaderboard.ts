import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { XPSystem } from '../../utils/xpSystem';
import { getUserLanguage, t, formatNumber } from '../../utils/i18n';

// Removed cronJobs import - we'll calculate time differently

export const data = new SlashCommandBuilder()
  .setName('leaderboard')
  .setDescription('Show the server leaderboard')
  .addBooleanOption(option =>
    option
      .setName('monthly')
      .setDescription('Show monthly leaderboard (resets every 28 days)')
      .setRequired(false)
  )
  .addIntegerOption(option =>
    option
      .setName('limit')
      .setDescription('Number of users to show (max 25)')
      .setMinValue(5)
      .setMaxValue(25)
      .setRequired(false)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) {
    await interaction.reply({
      content: 'This command can only be used in a server.',
      ephemeral: true
    });
    return;
  }

  await interaction.deferReply();

  const monthly = interaction.options.getBoolean('monthly') || false;
  const limit = interaction.options.getInteger('limit') || 10;
  const userLang = await getUserLanguage(interaction.user.id, interaction.guild.id);

  try {
    // Get leaderboard data
    const leaderboard = await XPSystem.getLeaderboard(interaction.guild.id, limit, monthly);

    if (leaderboard.length === 0) {
      await interaction.editReply({
        content: t('commands.leaderboard.no_data', {}, userLang)
      });
      return;
    }

    // Get user's position if not in top list
    const userStats = await XPSystem.getUserStats(interaction.user.id, interaction.guild.id);
    const userRank = monthly ? userStats?.monthlyRank : userStats?.rank;

    // Create embed
    const embed = new EmbedBuilder()
      .setTitle(monthly 
        ? t('commands.leaderboard.embed.monthly_title', {}, userLang)
        : t('commands.leaderboard.embed.title', {}, userLang)
      )
      .setDescription(monthly
        ? t('commands.leaderboard.embed.monthly_description', {}, userLang)
        : t('commands.leaderboard.embed.description', {}, userLang)
      )
      .setColor('#ffd700')
      .setThumbnail(interaction.guild.iconURL({ size: 128 }))
      .setTimestamp();

    // Build leaderboard text
    let leaderboardText = '';
    const medals = ['🥇', '🥈', '🥉'];

    for (let i = 0; i < leaderboard.length; i++) {
      const entry = leaderboard[i];
      const medal = i < 3 ? medals[i] : `**${i + 1}.**`;
      
      // Try to get user from guild to get current username
      let displayName = entry.username;
      try {
        const member = await interaction.guild.members.fetch(entry.userId);
        displayName = member.nickname || member.user.displayName || member.user.username;
      } catch {
        // User might have left the guild, use stored username
        displayName = entry.username || `User#${entry.userId.slice(-4)}`;
      }

      leaderboardText += `${medal} **${displayName}** - Level ${entry.level} (${formatNumber(entry.xp, userLang)} XP)\n`;
    }

    embed.addFields({
      name: monthly ? 'Monthly Top Users' : 'Top Users',
      value: leaderboardText,
      inline: false
    });

    // Add user's position if they're not in the top list
    if (userRank && userRank > limit) {
      const userXp = monthly ? userStats?.monthlyXp : userStats?.xp;
      const memberDisplayName = typeof interaction.member === 'object' && interaction.member && 'nickname' in interaction.member
        ? interaction.member.nickname || interaction.user.displayName || interaction.user.username
        : interaction.user.username;
        
      embed.addFields({
        name: 'Your Position',
        value: `**${userRank}.** ${memberDisplayName} - Level ${userStats?.level || 0} (${formatNumber(userXp || 0, userLang)} XP)`,
        inline: false
      });
    }

    // Add time until next reset for monthly leaderboard
    if (monthly) {
      try {
        // Simple calculation: 28 days from oldest user's last reset
        const oldestUser = await import('../../utils/database').then(db =>
          db.prisma.user.findFirst({
            where: { guildId: interaction.guild!.id },
            orderBy: { lastReset: 'asc' },
            select: { lastReset: true }
          })
        );

        if (oldestUser) {
          const nextResetTime = new Date(oldestUser.lastReset.getTime() + (28 * 24 * 60 * 60 * 1000));
          const timeUntilReset = Math.max(0, nextResetTime.getTime() - new Date().getTime());
          
          if (timeUntilReset > 0) {
            const days = Math.floor(timeUntilReset / (24 * 60 * 60 * 1000));
            const hours = Math.floor((timeUntilReset % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
            
            embed.setFooter({
              text: `Monthly reset in: ${days}d ${hours}h | Next reset is automatic`
            });
          }
        }
      } catch (error) {
        console.error('Error getting reset time:', error);
      }
    }

    // Add server stats
    const totalUsers = await import('../../utils/database').then(db =>
      db.prisma.user.count({
        where: { 
          guildId: interaction.guild!.id,
          ...(monthly ? { monthlyXp: { gt: 0 } } : { xp: { gt: 0 } })
        }
      })
    );

    embed.addFields({
      name: 'Server Stats',
      value: `📊 ${totalUsers} users with XP\n🏆 Showing top ${Math.min(limit, leaderboard.length)}`,
      inline: true
    });

    await interaction.editReply({ embeds: [embed] });

  } catch (error) {
    console.error('Error executing leaderboard command:', error);
    await interaction.editReply({
      content: t('errors.generic', {}, userLang)
    });
  }
}