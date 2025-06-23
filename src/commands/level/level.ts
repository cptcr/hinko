import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { XPSystem } from '../../utils/xpSystem';
import { LevelCardGenerator } from '../../utils/levelCard';
import { ensureUser } from '../../utils/database';
import { getUserLanguage, t } from '../../utils/i18n';

export const data = new SlashCommandBuilder()
  .setName('level')
  .setDescription('Show your current level and XP progress')
  .addUserOption(option =>
    option
      .setName('user')
      .setDescription('Show level information for a specific user')
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

  const targetUser = interaction.options.getUser('user') || interaction.user;
  const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
  
  if (!targetMember) {
    const userLang = await getUserLanguage(interaction.user.id, interaction.guild.id);
    await interaction.editReply({
      content: t('commands.level.user_not_found', {}, userLang)
    });
    return;
  }

  try {
    // Ensure user exists in database
    await ensureUser(targetUser.id, interaction.guild.id, targetUser.username);

    // Get user stats
    const stats = await XPSystem.getUserStats(targetUser.id, interaction.guild.id);
    
    if (!stats) {
      const userLang = await getUserLanguage(interaction.user.id, interaction.guild.id);
      await interaction.editReply({
        content: t('commands.level.no_xp', {}, userLang)
      });
      return;
    }

    // Get user language and level card settings
    const userLang = await getUserLanguage(targetUser.id, interaction.guild.id);
    
    // Get user's card customization settings
    const user = await import('../../utils/database').then(db => 
      db.prisma.user.findUnique({
        where: {
          id_guildId: {
            id: targetUser.id,
            guildId: interaction.guild!.id
          }
        },
        select: {
          cardTheme: true,
          cardColor: true,
          cardBg: true
        }
      })
    );

    const cardOptions = {
      theme: user?.cardTheme || 'default',
      color: user?.cardColor || '#7289da',
      backgroundImage: user?.cardBg || undefined
    };

    // Generate level card (jetzt ohne Canvas)
    const levelCardResult = await LevelCardGenerator.generateLevelCard(
      targetMember.displayName,
      targetUser.displayAvatarURL({ extension: 'png', size: 256 }),
      stats.level,
      stats.xp,
      stats.rank || 0,
      cardOptions
    );

    // Add additional info if viewing own stats or if admin
    const isOwnStats = targetUser.id === interaction.user.id;
    const memberPermissions = interaction.member?.permissions;
    const isAdmin = memberPermissions && typeof memberPermissions !== 'string' && memberPermissions.has('Administrator');
    
    if (isOwnStats || isAdmin) {
      levelCardResult.embed.addFields(
        {
          name: t('commands.level.embed.total_xp', {}, userLang),
          value: stats.totalXp.toLocaleString(),
          inline: true
        },
        {
          name: t('commands.level.embed.monthly_xp', {}, userLang),
          value: stats.monthlyXp.toLocaleString(),
          inline: true
        }
      );
    }

    // Send the embed
    await interaction.editReply({
      embeds: [levelCardResult.embed]
    });

  } catch (error) {
    console.error('Error executing level command:', error);
    const userLang = await getUserLanguage(interaction.user.id, interaction.guild.id);
    await interaction.editReply({
      content: t('errors.generic', {}, userLang)
    });
  }
}