import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { LevelCardGenerator } from '../../utils/levelCard';
import { ensureUser, prisma } from '../../utils/database';
import { getUserLanguage, t } from '../../utils/i18n';

export const data = new SlashCommandBuilder()
  .setName('customize')
  .setDescription('Customize your level card appearance')
  .addStringOption(option =>
    option
      .setName('category')
      .setDescription('Category to customize')
      .setRequired(true)
      .addChoices(
        { name: 'Theme', value: 'theme' },
        { name: 'Color', value: 'color' },
        { name: 'Background', value: 'background' }
      )
  )
  .addStringOption(option =>
    option
      .setName('value')
      .setDescription('New value for the category')
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

  const category = interaction.options.getString('category', true);
  const value = interaction.options.getString('value');
  const userLang = await getUserLanguage(interaction.user.id, interaction.guild.id);

  // Ensure user exists
  await ensureUser(interaction.user.id, interaction.guild.id, interaction.user.username);

  try {
    switch (category) {
      case 'theme':
        await handleThemeCustomization(interaction, value, userLang);
        break;
      case 'color':
        await handleColorCustomization(interaction, value, userLang);
        break;
      case 'background':
        await handleBackgroundCustomization(interaction, value, userLang);
        break;
      default:
        await interaction.reply({
          content: t('errors.generic', {}, userLang),
          ephemeral: true
        });
    }
  } catch (error) {
    console.error('Error executing customize command:', error);
    await interaction.reply({
      content: t('errors.generic', {}, userLang),
      ephemeral: true
    });
  }
}

async function handleThemeCustomization(
  interaction: ChatInputCommandInteraction,
  value: string | null,
  userLang: string
) {
  const availableThemes = LevelCardGenerator.getAvailableThemes();

  if (!value) {
    // Show available themes
    const themeList = availableThemes.map(theme => {
      const themeName = t(`card_themes.${theme}`, {}, userLang);
      return `\`${theme}\` - ${themeName}`;
    }).join('\n');

    const embed = new EmbedBuilder()
      .setTitle('🎨 Available Themes')
      .setDescription(t('commands.customize.theme.available', {
        themes: themeList
      }, userLang))
      .setColor('#7289da')
      .setFooter({ text: 'Use /customize theme <theme_name> to change your theme' });

    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  if (!LevelCardGenerator.isValidTheme(value)) {
    await interaction.reply({
      content: t('commands.customize.theme.invalid', {
        themes: availableThemes.join(', ')
      }, userLang),
      ephemeral: true
    });
    return;
  }

  // Update user's theme
  await prisma.user.update({
    where: {
      id_guildId: {
        id: interaction.user.id,
        guildId: interaction.guild!.id
      }
    },
    data: { cardTheme: value }
  });

  const themeName = t(`card_themes.${value}`, {}, userLang);
  await interaction.reply({
    content: t('commands.customize.theme.success', { theme: themeName }, userLang),
    ephemeral: true
  });
}

async function handleColorCustomization(
  interaction: ChatInputCommandInteraction,
  value: string | null,
  userLang: string
) {
  if (!value) {
    const embed = new EmbedBuilder()
      .setTitle('🎨 Color Customization')
      .setDescription('Change your level card\'s primary color using a hex color code.')
      .addFields(
        {
          name: 'Format',
          value: '`#RRGGBB` (e.g., #7289da, #ff0000, #00ff00)',
          inline: false
        },
        {
          name: 'Examples',
          value: '🔵 `#0099ff` - Blue\n🟢 `#00ff00` - Green\n🔴 `#ff0000` - Red\n🟣 `#9900ff` - Purple',
          inline: false
        }
      )
      .setColor('#7289da')
      .setFooter({ text: 'Use /customize color <hex_color> to change your color' });

    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  if (!LevelCardGenerator.isValidHexColor(value)) {
    await interaction.reply({
      content: t('commands.customize.color.invalid', {}, userLang),
      ephemeral: true
    });
    return;
  }

  // Update user's color
  await prisma.user.update({
    where: {
      id_guildId: {
        id: interaction.user.id,
        guildId: interaction.guild!.id
      }
    },
    data: { cardColor: value }
  });

  await interaction.reply({
    content: t('commands.customize.color.success', { color: value }, userLang),
    ephemeral: true
  });
}

async function handleBackgroundCustomization(
  interaction: ChatInputCommandInteraction,
  value: string | null,
  userLang: string
) {
  if (!value) {
    const embed = new EmbedBuilder()
      .setTitle('🖼️ Background Customization')
      .setDescription('Set a custom background image for your level card.')
      .addFields(
        {
          name: 'Instructions',
          value: '• Provide a direct image URL (jpg, png, gif)\n• Use `reset` to remove custom background\n• Image should be at least 800x250 pixels for best quality',
          inline: false
        },
        {
          name: 'Tips',
          value: '• Darker images work better for text readability\n• The image will be overlayed with a semi-transparent layer\n• Free image hosting: imgur.com, discord attachments',
          inline: false
        }
      )
      .setColor('#7289da')
      .setFooter({ text: 'Use /customize background <image_url> to change your background' });

    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  if (value.toLowerCase() === 'reset') {
    // Reset to default background
    await prisma.user.update({
      where: {
        id_guildId: {
          id: interaction.user.id,
          guildId: interaction.guild!.id
        }
      },
      data: { cardBg: null }
    });

    await interaction.reply({
      content: t('commands.customize.background.reset', {}, userLang),
      ephemeral: true
    });
    return;
  }

  // Validate image URL
  await interaction.deferReply({ ephemeral: true });
  
  const isValidImage = await LevelCardGenerator.isValidImageUrl(value);
  if (!isValidImage) {
    await interaction.editReply({
      content: t('commands.customize.background.invalid', {}, userLang)
    });
    return;
  }

  // Update user's background
  await prisma.user.update({
    where: {
      id_guildId: {
        id: interaction.user.id,
        guildId: interaction.guild!.id
      }
    },
    data: { cardBg: value }
  });

  await interaction.editReply({
    content: t('commands.customize.background.success', {}, userLang)
  });
}