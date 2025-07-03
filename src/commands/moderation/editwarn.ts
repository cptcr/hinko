import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { prisma } from '../../utils/database';
import { getUserLanguage, t } from '../../utils/i18n';

export const data = new SlashCommandBuilder()
  .setName('editwarn')
  .setDescription('Edit a warning')
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .addIntegerOption(option =>
    option
      .setName('id')
      .setDescription('Warning ID to edit')
      .setRequired(true)
      .setMinValue(1)
  )
  .addStringOption(option =>
    option
      .setName('reason')
      .setDescription('New reason for the warning')
      .setRequired(false)
  )
  .addStringOption(option =>
    option
      .setName('duration')
      .setDescription('New duration for the warning (use "permanent" to remove expiry)')
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

  const warnId = interaction.options.getInteger('id', true);
  const newReason = interaction.options.getString('reason');
  const newDuration = interaction.options.getString('duration');
  const userLang = await getUserLanguage(interaction.user.id, interaction.guild.id);

  if (!newReason && !newDuration) {
    await interaction.reply({
      content: t('moderation.editwarn.no_changes', {}, userLang),
      ephemeral: true
    });
    return;
  }

  const warning = await prisma.warn.findFirst({
    where: {
      id: warnId,
      guildId: interaction.guild.id,
      active: true
    }
  });

  if (!warning) {
    await interaction.reply({
      content: t('moderation.editwarn.not_found', { id: warnId }, userLang),
      ephemeral: true
    });
    return;
  }

  const updateData: any = {};
  const historyData: any = {
    warnId: warnId,
    moderatorId: interaction.user.id,
    action: 'edit'
  };

  if (newReason) {
    updateData.reason = newReason;
    historyData.oldReason = warning.reason;
    historyData.newReason = newReason;
  }

  if (newDuration) {
    historyData.oldExpiry = warning.expiresAt;
    
    if (newDuration.toLowerCase() === 'permanent') {
      updateData.expiresAt = null;
      historyData.newExpiry = null;
    } else {
      const duration = parseDuration(newDuration);
      if (!duration) {
        await interaction.reply({
          content: t('moderation.editwarn.invalid_duration', {}, userLang),
          ephemeral: true
        });
        return;
      }
      const newExpiry = new Date(Date.now() + duration);
      updateData.expiresAt = newExpiry;
      historyData.newExpiry = newExpiry;
    }
  }

  await prisma.$transaction([
    prisma.warn.update({
      where: { id: warnId },
      data: updateData
    }),
    prisma.warnHistory.create({
      data: historyData
    })
  ]);

  const targetUser = await interaction.client.users.fetch(warning.userId).catch(() => null);

  const embed = new EmbedBuilder()
    .setTitle(t('moderation.editwarn.title', {}, userLang))
    .setColor('#0099ff')
    .setDescription(t('moderation.editwarn.description', {
      id: warnId,
      user: targetUser ? targetUser.toString() : `<@${warning.userId}>`
    }, userLang))
    .setTimestamp();

  if (newReason) {
    embed.addFields(
      {
        name: t('moderation.editwarn.old_reason', {}, userLang),
        value: warning.reason,
        inline: false
      },
      {
        name: t('moderation.editwarn.new_reason', {}, userLang),
        value: newReason,
        inline: false
      }
    );
  }

  if (newDuration) {
    const oldExpiry = warning.expiresAt 
      ? `<t:${Math.floor(warning.expiresAt.getTime() / 1000)}:F>` 
      : t('moderation.editwarn.permanent', {}, userLang);
    
    const newExpiry = updateData.expiresAt 
      ? `<t:${Math.floor(updateData.expiresAt.getTime() / 1000)}:F>` 
      : t('moderation.editwarn.permanent', {}, userLang);

    embed.addFields(
      {
        name: t('moderation.editwarn.old_expiry', {}, userLang),
        value: oldExpiry,
        inline: true
      },
      {
        name: t('moderation.editwarn.new_expiry', {}, userLang),
        value: newExpiry,
        inline: true
      }
    );
  }

  embed.addFields({
    name: t('moderation.editwarn.edited_by', {}, userLang),
    value: interaction.user.username,
    inline: false
  });

  await interaction.reply({ embeds: [embed] });

  if (targetUser) {
    try {
      const dmEmbed = new EmbedBuilder()
        .setTitle(t('moderation.editwarn.dm_title', {}, userLang))
        .setColor('#0099ff')
        .setDescription(t('moderation.editwarn.dm_description', {
          guild: interaction.guild.name,
          id: warnId
        }, userLang))
        .setTimestamp();

      if (newReason) {
        dmEmbed.addFields({
          name: t('moderation.editwarn.new_reason', {}, userLang),
          value: newReason,
          inline: false
        });
      }

      if (newDuration && updateData.expiresAt) {
        dmEmbed.addFields({
          name: t('moderation.editwarn.new_expiry', {}, userLang),
          value: `<t:${Math.floor(updateData.expiresAt.getTime() / 1000)}:F>`,
          inline: false
        });
      }

      await targetUser.send({ embeds: [dmEmbed] });
    } catch (error) {
      console.log(`Could not DM user ${targetUser.id}`);
    }
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