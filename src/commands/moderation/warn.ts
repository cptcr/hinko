import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { prisma } from '../../utils/database';
import { getUserLanguage, t } from '../../utils/i18n';

export const data = new SlashCommandBuilder()
  .setName('warn')
  .setDescription('Warn a user')
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .addUserOption(option =>
    option
      .setName('user')
      .setDescription('User to warn')
      .setRequired(true)
  )
  .addStringOption(option =>
    option
      .setName('reason')
      .setDescription('Reason for the warning')
      .setRequired(true)
  )
  .addStringOption(option =>
    option
      .setName('duration')
      .setDescription('Duration for temporary warning (e.g., 7d, 30d)')
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
  const reason = interaction.options.getString('reason', true);
  const durationStr = interaction.options.getString('duration');
  const userLang = await getUserLanguage(interaction.user.id, interaction.guild.id);

  if (targetUser.id === interaction.user.id) {
    await interaction.reply({
      content: t('moderation.warn.cannot_warn_self', {}, userLang),
      ephemeral: true
    });
    return;
  }

  if (targetUser.bot) {
    await interaction.reply({
      content: t('moderation.warn.cannot_warn_bot', {}, userLang),
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
  if (targetMember.roles.highest.position >= executorMember.roles.highest.position) {
    await interaction.reply({
      content: t('moderation.warn.higher_role', {}, userLang),
      ephemeral: true
    });
    return;
  }

  let expiresAt: Date | null = null;
  if (durationStr) {
    const duration = parseDuration(durationStr);
    if (!duration) {
      await interaction.reply({
        content: t('moderation.warn.invalid_duration', {}, userLang),
        ephemeral: true
      });
      return;
    }
    expiresAt = new Date(Date.now() + duration);
  }

  try {
    const warn = await prisma.warn.create({
      data: {
        userId: targetUser.id,
        guildId: interaction.guild.id,
        moderatorId: interaction.user.id,
        reason: reason,
        expiresAt: expiresAt
      }
    });

    const activeWarns = await prisma.warn.count({
      where: {
        userId: targetUser.id,
        guildId: interaction.guild.id,
        active: true,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } }
        ]
      }
    });

    const embed = new EmbedBuilder()
      .setTitle(t('moderation.warn.title', {}, userLang))
      .setColor('#ffcc00')
      .setDescription(t('moderation.warn.description', {
        user: targetUser.toString(),
        moderator: interaction.user.toString(),
        reason: reason
      }, userLang))
      .addFields(
        {
          name: t('moderation.warn.warn_id', {}, userLang),
          value: `#${warn.id}`,
          inline: true
        },
        {
          name: t('moderation.warn.active_warns', {}, userLang),
          value: activeWarns.toString(),
          inline: true
        }
      )
      .setTimestamp();

    if (expiresAt) {
      embed.addFields({
        name: t('moderation.warn.expires', {}, userLang),
        value: `<t:${Math.floor(expiresAt.getTime() / 1000)}:F>`,
        inline: true
      });
    }

    await interaction.reply({ embeds: [embed] });

    try {
      const dmEmbed = new EmbedBuilder()
        .setTitle(t('moderation.warn.dm_title', {}, userLang))
        .setColor('#ffcc00')
        .setDescription(t('moderation.warn.dm_description', {
          guild: interaction.guild.name,
          reason: reason
        }, userLang))
        .setTimestamp();

      if (expiresAt) {
        dmEmbed.addFields({
          name: t('moderation.warn.expires', {}, userLang),
          value: `<t:${Math.floor(expiresAt.getTime() / 1000)}:F>`,
          inline: false
        });
      }

      await targetUser.send({ embeds: [dmEmbed] });
    } catch (error) {
      console.log(`Could not DM user ${targetUser.id}`);
    }

  } catch (error) {
    console.error('Error creating warning:', error);
    await interaction.reply({
      content: t('errors.generic', {}, userLang),
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