import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { prisma } from '../../utils/database';
import { getUserLanguage, t } from '../../utils/i18n';

export const data = new SlashCommandBuilder()
  .setName('timeout')
  .setDescription('Timeout a user')
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .addUserOption(option =>
    option
      .setName('user')
      .setDescription('User to timeout')
      .setRequired(true)
  )
  .addStringOption(option =>
    option
      .setName('duration')
      .setDescription('Duration of the timeout (e.g., 10m, 1h, 1d)')
      .setRequired(true)
  )
  .addStringOption(option =>
    option
      .setName('reason')
      .setDescription('Reason for the timeout')
      .setRequired(false)
  );

export const category = 'moderation';
export const permissions = [PermissionFlagsBits.ModerateMembers];

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) {
    await interaction.reply({
      content: 'This command can only be used in a server.',
      ephemeral: true
    });
    return;
  }

  const targetUser = interaction.options.getUser('user', true);
  const durationStr = interaction.options.getString('duration', true);
  const reason = interaction.options.getString('reason') || 'No reason provided';
  const userLang = await getUserLanguage(interaction.user.id, interaction.guild.id);

  const duration = parseDuration(durationStr);
  if (!duration) {
    await interaction.reply({
      content: t('moderation.timeout.invalid_duration', {}, userLang),
      ephemeral: true
    });
    return;
  }

  const maxTimeout = 28 * 24 * 60 * 60 * 1000;
  if (duration > maxTimeout) {
    await interaction.reply({
      content: t('moderation.timeout.duration_too_long', {}, userLang),
      ephemeral: true
    });
    return;
  }

  if (targetUser.id === interaction.user.id) {
    await interaction.reply({
      content: t('moderation.timeout.cannot_timeout_self', {}, userLang),
      ephemeral: true
    });
    return;
  }

  if (targetUser.bot) {
    await interaction.reply({
      content: t('moderation.timeout.cannot_timeout_bot', {}, userLang),
      ephemeral: true
    });
    return;
  }

  const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
  if (!targetMember) {
    await interaction.reply({
      content: t('errors.user_not_found', {}, userLang),
      ephemeral: true
    });
    return;
  }

  const executorMember = await interaction.guild.members.fetch(interaction.user.id);
  
  if (!targetMember.moderatable) {
    await interaction.reply({
      content: t('moderation.timeout.cannot_timeout', {}, userLang),
      ephemeral: true
    });
    return;
  }

  if (targetMember.roles.highest.position >= executorMember.roles.highest.position) {
    await interaction.reply({
      content: t('moderation.timeout.higher_role', {}, userLang),
      ephemeral: true
    });
    return;
  }

  try {
    const timeoutUntil = new Date(Date.now() + duration);
    await targetMember.timeout(duration, `${reason} | By ${interaction.user.tag}`);

    await prisma.modAction.create({
      data: {
        userId: targetUser.id,
        guildId: interaction.guild.id,
        moderatorId: interaction.user.id,
        action: 'timeout',
        reason: reason,
        duration: duration,
        expiresAt: timeoutUntil
      }
    });

    const embed = new EmbedBuilder()
      .setTitle(t('moderation.timeout.title', {}, userLang))
      .setColor('#ff9900')
      .setDescription(t('moderation.timeout.description', {
        user: targetUser.toString(),
        moderator: interaction.user.toString()
      }, userLang))
      .addFields(
        {
          name: t('moderation.timeout.reason', {}, userLang),
          value: reason,
          inline: false
        },
        {
          name: t('moderation.timeout.duration', {}, userLang),
          value: formatDuration(duration, userLang),
          inline: true
        },
        {
          name: t('moderation.timeout.expires', {}, userLang),
          value: `<t:${Math.floor(timeoutUntil.getTime() / 1000)}:F>`,
          inline: true
        }
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });

    try {
      const dmEmbed = new EmbedBuilder()
        .setTitle(t('moderation.timeout.dm_title', {}, userLang))
        .setColor('#ff9900')
        .setDescription(t('moderation.timeout.dm_description', {
          guild: interaction.guild.name,
          reason: reason,
          duration: formatDuration(duration, userLang)
        }, userLang))
        .addFields({
          name: t('moderation.timeout.expires', {}, userLang),
          value: `<t:${Math.floor(timeoutUntil.getTime() / 1000)}:F>`,
          inline: false
        })
        .setTimestamp();

      await targetUser.send({ embeds: [dmEmbed] });
    } catch (error) {
      console.log(`Could not DM user ${targetUser.id}`);
    }

  } catch (error) {
    console.error('Error timing out user:', error);
    await interaction.reply({
      content: t('moderation.timeout.error', {}, userLang),
      ephemeral: true
    });
  }
}

function parseDuration(durationStr: string): number | null {
  const regex = /^(\d+)([smhd])$/i;
  const match = durationStr.toLowerCase().match(regex);
  
  if (!match) return null;
  
  const value = parseInt(match[1]);
  const unit = match[2];
  
  switch (unit) {
    case 's':
      return value * 1000;
    case 'm':
      return value * 60 * 1000;
    case 'h':
      return value * 60 * 60 * 1000;
    case 'd':
      return value * 24 * 60 * 60 * 1000;
    default:
      return null;
  }
}

function formatDuration(ms: number, userLang: string): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) {
    return days === 1 
      ? t('common.time.days', { count: days }, userLang)
      : t('common.time.days_plural', { count: days }, userLang);
  } else if (hours > 0) {
    return hours === 1
      ? t('common.time.hours', { count: hours }, userLang)
      : t('common.time.hours_plural', { count: hours }, userLang);
  } else if (minutes > 0) {
    return minutes === 1
      ? t('common.time.minutes', { count: minutes }, userLang)
      : t('common.time.minutes_plural', { count: minutes }, userLang);
  } else {
    return seconds === 1
      ? t('common.time.seconds', { count: seconds }, userLang)
      : t('common.time.seconds_plural', { count: seconds }, userLang);
  }
}