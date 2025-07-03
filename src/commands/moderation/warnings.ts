import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { prisma } from '../../utils/database';
import { getUserLanguage, t } from '../../utils/i18n';

export const data = new SlashCommandBuilder()
  .setName('warnings')
  .setDescription('View warnings for a user')
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .addUserOption(option =>
    option
      .setName('user')
      .setDescription('User to check warnings for')
      .setRequired(true)
  )
  .addBooleanOption(option =>
    option
      .setName('all')
      .setDescription('Show all warnings including expired and deleted')
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

  await interaction.deferReply();

  const targetUser = interaction.options.getUser('user', true);
  const showAll = interaction.options.getBoolean('all') || false;
  const userLang = await getUserLanguage(interaction.user.id, interaction.guild.id);

  const whereClause: any = {
    userId: targetUser.id,
    guildId: interaction.guild.id
  };

  if (!showAll) {
    whereClause.active = true;
    whereClause.OR = [
      { expiresAt: null },
      { expiresAt: { gt: new Date() } }
    ];
  }

  const warnings = await prisma.warn.findMany({
    where: whereClause,
    orderBy: { createdAt: 'desc' },
    include: {
      history: {
        orderBy: { createdAt: 'desc' },
        take: 1
      }
    }
  });

  if (warnings.length === 0) {
    await interaction.editReply({
      content: t('moderation.warnings.no_warnings', { user: targetUser.username }, userLang)
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle(t('moderation.warnings.title', { user: targetUser.username }, userLang))
    .setColor('#ff9900')
    .setThumbnail(targetUser.displayAvatarURL({ size: 128 }))
    .setTimestamp();

  let activeCount = 0;
  let expiredCount = 0;
  let deletedCount = 0;

  for (const warning of warnings) {
    let status = '✅';
    if (warning.deletedAt) {
      status = '🗑️';
      deletedCount++;
    } else if (warning.expiresAt && new Date() > warning.expiresAt) {
      status = '⏰';
      expiredCount++;
    } else {
      activeCount++;
    }

    const moderator = await interaction.client.users.fetch(warning.moderatorId).catch(() => null);
    const moderatorName = moderator ? moderator.username : 'Unknown';

    let fieldValue = `**${t('moderation.warnings.reason', {}, userLang)}:** ${warning.reason}\n`;
    fieldValue += `**${t('moderation.warnings.moderator', {}, userLang)}:** ${moderatorName}\n`;
    fieldValue += `**${t('moderation.warnings.date', {}, userLang)}:** <t:${Math.floor(warning.createdAt.getTime() / 1000)}:f>`;

    if (warning.expiresAt) {
      fieldValue += `\n**${t('moderation.warnings.expires', {}, userLang)}:** <t:${Math.floor(warning.expiresAt.getTime() / 1000)}:R>`;
    }

    if (warning.deletedAt && warning.deletedBy) {
      const deletedByUser = await interaction.client.users.fetch(warning.deletedBy).catch(() => null);
      fieldValue += `\n**${t('moderation.warnings.deleted_by', {}, userLang)}:** ${deletedByUser ? deletedByUser.username : 'Unknown'}`;
    }

    if (warning.history.length > 0) {
      fieldValue += `\n*${t('moderation.warnings.edited', {}, userLang)}*`;
    }

    embed.addFields({
      name: `${status} ${t('moderation.warnings.warning', {}, userLang)} #${warning.id}`,
      value: fieldValue,
      inline: false
    });
  }

  embed.setDescription(t('moderation.warnings.summary', {
    total: warnings.length,
    active: activeCount,
    expired: expiredCount,
    deleted: deletedCount
  }, userLang));

  await interaction.editReply({ embeds: [embed] });
}