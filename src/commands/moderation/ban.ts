import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { prisma } from '../../utils/database';
import { getUserLanguage, t } from '../../utils/i18n';

export const data = new SlashCommandBuilder()
  .setName('ban')
  .setDescription('Ban a user from the server')
  .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
  .addUserOption(option =>
    option
      .setName('user')
      .setDescription('User to ban')
      .setRequired(true)
  )
  .addStringOption(option =>
    option
      .setName('reason')
      .setDescription('Reason for the ban')
      .setRequired(false)
  )
  .addIntegerOption(option =>
    option
      .setName('delete_days')
      .setDescription('Number of days of messages to delete (0-7)')
      .setMinValue(0)
      .setMaxValue(7)
      .setRequired(false)
  );

export const category = 'moderation';
export const permissions = [PermissionFlagsBits.BanMembers];

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) {
    await interaction.reply({
      content: 'This command can only be used in a server.',
      ephemeral: true
    });
    return;
  }

  const targetUser = interaction.options.getUser('user', true);
  const reason = interaction.options.getString('reason') || 'No reason provided';
  const deleteDays = interaction.options.getInteger('delete_days') || 0;
  const userLang = await getUserLanguage(interaction.user.id, interaction.guild.id);

  if (targetUser.id === interaction.user.id) {
    await interaction.reply({
      content: t('moderation.ban.cannot_ban_self', {}, userLang),
      ephemeral: true
    });
    return;
  }

  if (targetUser.id === interaction.client.user?.id) {
    await interaction.reply({
      content: t('moderation.ban.cannot_ban_bot', {}, userLang),
      ephemeral: true
    });
    return;
  }

  const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

  if (targetMember) {
    const executorMember = await interaction.guild.members.fetch(interaction.user.id);
    
    if (!targetMember.bannable) {
      await interaction.reply({
        content: t('moderation.ban.cannot_ban', {}, userLang),
        ephemeral: true
      });
      return;
    }

    if (targetMember.roles.highest.position >= executorMember.roles.highest.position) {
      await interaction.reply({
        content: t('moderation.ban.higher_role', {}, userLang),
        ephemeral: true
      });
      return;
    }
  }

  try {
    const dmEmbed = new EmbedBuilder()
      .setTitle(t('moderation.ban.dm_title', {}, userLang))
      .setColor('#ff0000')
      .setDescription(t('moderation.ban.dm_description', {
        guild: interaction.guild.name,
        reason: reason
      }, userLang))
      .setTimestamp();

    try {
      await targetUser.send({ embeds: [dmEmbed] });
    } catch (error) {
      console.log(`Could not DM user ${targetUser.id}`);
    }

    await interaction.guild.members.ban(targetUser.id, {
      reason: `${reason} | Banned by ${interaction.user.tag}`,
      deleteMessageSeconds: deleteDays * 24 * 60 * 60
    });

    await prisma.modAction.create({
      data: {
        userId: targetUser.id,
        guildId: interaction.guild.id,
        moderatorId: interaction.user.id,
        action: 'ban',
        reason: reason
      }
    });

    const embed = new EmbedBuilder()
      .setTitle(t('moderation.ban.title', {}, userLang))
      .setColor('#ff0000')
      .setDescription(t('moderation.ban.description', {
        user: targetUser.toString(),
        moderator: interaction.user.toString()
      }, userLang))
      .addFields(
        {
          name: t('moderation.ban.reason', {}, userLang),
          value: reason,
          inline: false
        }
      )
      .setTimestamp();

    if (deleteDays > 0) {
      embed.addFields({
        name: t('moderation.ban.messages_deleted', {}, userLang),
        value: t('moderation.ban.messages_deleted_value', { days: deleteDays }, userLang),
        inline: true
      });
    }

    await interaction.reply({ embeds: [embed] });

  } catch (error) {
    console.error('Error banning user:', error);
    await interaction.reply({
      content: t('moderation.ban.error', {}, userLang),
      ephemeral: true
    });
  }
}