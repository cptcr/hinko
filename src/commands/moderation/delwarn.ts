import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { prisma } from '../../utils/database';
import { getUserLanguage, t } from '../../utils/i18n';

export const data = new SlashCommandBuilder()
  .setName('delwarn')
  .setDescription('Delete a warning')
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .addIntegerOption(option =>
    option
      .setName('id')
      .setDescription('Warning ID to delete')
      .setRequired(true)
      .setMinValue(1)
  )
  .addStringOption(option =>
    option
      .setName('reason')
      .setDescription('Reason for deleting the warning')
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
  const deleteReason = interaction.options.getString('reason');
  const userLang = await getUserLanguage(interaction.user.id, interaction.guild.id);

  const warning = await prisma.warn.findFirst({
    where: {
      id: warnId,
      guildId: interaction.guild.id
    }
  });

  if (!warning) {
    await interaction.reply({
      content: t('moderation.delwarn.not_found', { id: warnId }, userLang),
      ephemeral: true
    });
    return;
  }

  if (warning.deletedAt) {
    await interaction.reply({
      content: t('moderation.delwarn.already_deleted', { id: warnId }, userLang),
      ephemeral: true
    });
    return;
  }

  await prisma.$transaction([
    prisma.warn.update({
      where: { id: warnId },
      data: {
        active: false,
        deletedAt: new Date(),
        deletedBy: interaction.user.id
      }
    }),
    prisma.warnHistory.create({
      data: {
        warnId: warnId,
        moderatorId: interaction.user.id,
        action: 'delete',
        oldReason: deleteReason || 'No reason provided'
      }
    })
  ]);

  const targetUser = await interaction.client.users.fetch(warning.userId).catch(() => null);
  const originalModerator = await interaction.client.users.fetch(warning.moderatorId).catch(() => null);

  const embed = new EmbedBuilder()
    .setTitle(t('moderation.delwarn.title', {}, userLang))
    .setColor('#00ff00')
    .setDescription(t('moderation.delwarn.description', {
      id: warnId,
      user: targetUser ? targetUser.toString() : `<@${warning.userId}>`
    }, userLang))
    .addFields(
      {
        name: t('moderation.delwarn.original_reason', {}, userLang),
        value: warning.reason,
        inline: false
      },
      {
        name: t('moderation.delwarn.warned_by', {}, userLang),
        value: originalModerator ? originalModerator.username : 'Unknown',
        inline: true
      },
      {
        name: t('moderation.delwarn.deleted_by', {}, userLang),
        value: interaction.user.username,
        inline: true
      }
    )
    .setTimestamp();

  if (deleteReason) {
    embed.addFields({
      name: t('moderation.delwarn.delete_reason', {}, userLang),
      value: deleteReason,
      inline: false
    });
  }

  await interaction.reply({ embeds: [embed] });

  if (targetUser) {
    try {
      const dmEmbed = new EmbedBuilder()
        .setTitle(t('moderation.delwarn.dm_title', {}, userLang))
        .setColor('#00ff00')
        .setDescription(t('moderation.delwarn.dm_description', {
          guild: interaction.guild.name,
          id: warnId
        }, userLang))
        .setTimestamp();

      await targetUser.send({ embeds: [dmEmbed] });
    } catch (error) {
      console.log(`Could not DM user ${targetUser.id}`);
    }
  }
}