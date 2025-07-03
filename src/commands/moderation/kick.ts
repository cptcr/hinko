import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { prisma } from '../../utils/database';
import { getUserLanguage, t } from '../../utils/i18n';

export const data = new SlashCommandBuilder()
  .setName('kick')
  .setDescription('Kick a user from the server')
  .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
  .addUserOption(option =>
    option
      .setName('user')
      .setDescription('User to kick')
      .setRequired(true)
  )
  .addStringOption(option =>
    option
      .setName('reason')
      .setDescription('Reason for the kick')
      .setRequired(false)
  );

export const category = 'moderation';
export const permissions = [PermissionFlagsBits.KickMembers];

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
  const userLang = await getUserLanguage(interaction.user.id, interaction.guild.id);

  if (targetUser.id === interaction.user.id) {
    await interaction.reply({
      content: t('moderation.kick.cannot_kick_self', {}, userLang),
      ephemeral: true
    });
    return;
  }

  if (targetUser.id === interaction.client.user?.id) {
    await interaction.reply({
      content: t('moderation.kick.cannot_kick_bot', {}, userLang),
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
  
  if (!targetMember.kickable) {
    await interaction.reply({
      content: t('moderation.kick.cannot_kick', {}, userLang),
      ephemeral: true
    });
    return;
  }

  if (targetMember.roles.highest.position >= executorMember.roles.highest.position) {
    await interaction.reply({
      content: t('moderation.kick.higher_role', {}, userLang),
      ephemeral: true
    });
    return;
  }

  try {
    const dmEmbed = new EmbedBuilder()
      .setTitle(t('moderation.kick.dm_title', {}, userLang))
      .setColor('#ff6600')
      .setDescription(t('moderation.kick.dm_description', {
        guild: interaction.guild.name,
        reason: reason
      }, userLang))
      .setTimestamp();

    try {
      await targetUser.send({ embeds: [dmEmbed] });
    } catch (error) {
      console.log(`Could not DM user ${targetUser.id}`);
    }

    await targetMember.kick(`${reason} | Kicked by ${interaction.user.tag}`);

    await prisma.modAction.create({
      data: {
        userId: targetUser.id,
        guildId: interaction.guild.id,
        moderatorId: interaction.user.id,
        action: 'kick',
        reason: reason
      }
    });

    const embed = new EmbedBuilder()
      .setTitle(t('moderation.kick.title', {}, userLang))
      .setColor('#ff6600')
      .setDescription(t('moderation.kick.description', {
        user: targetUser.toString(),
        moderator: interaction.user.toString()
      }, userLang))
      .addFields({
        name: t('moderation.kick.reason', {}, userLang),
        value: reason,
        inline: false
      })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });

  } catch (error) {
    console.error('Error kicking user:', error);
    await interaction.reply({
      content: t('moderation.kick.error', {}, userLang),
      ephemeral: true
    });
  }
}