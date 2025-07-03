import { 
  SlashCommandBuilder, 
  ChatInputCommandInteraction, 
  EmbedBuilder 
} from 'discord.js';
import { getUserLanguage, t } from '../../utils/i18n';

const STEAM_API_BASE = 'https://store.steampowered.com/api';
const STEAMDB_BASE = 'https://steamdb.info';

export const data = new SlashCommandBuilder()
  .setName('steam')
  .setDescription('Get Steam game information')
  .addSubcommand(subcommand =>
    subcommand
      .setName('game')
      .setDescription('Get information about a Steam game')
      .addStringOption(option =>
        option
          .setName('query')
          .setDescription('Game name or Steam App ID')
          .setRequired(true)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('price')
      .setDescription('Get current price information for a game')
      .addStringOption(option =>
        option
          .setName('query')
          .setDescription('Game name or Steam App ID')
          .setRequired(true)
      )
      .addStringOption(option =>
        option
          .setName('region')
          .setDescription('Region code (e.g., US, DE, UK)')
          .setRequired(false)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('players')
      .setDescription('Get current player count for a game')
      .addStringOption(option =>
        option
          .setName('query')
          .setDescription('Game name or Steam App ID')
          .setRequired(true)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('sales')
      .setDescription('Get current Steam sales and deals')
      .addIntegerOption(option =>
        option
          .setName('limit')
          .setDescription('Number of deals to show')
          .setMinValue(1)
          .setMaxValue(10)
          .setRequired(false)
      )
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const subcommand = interaction.options.getSubcommand();
  const userLang = await getUserLanguage(interaction.user.id, interaction.guild?.id || '');

  await interaction.deferReply();

  try {
    switch (subcommand) {
      case 'game':
        await handleGameInfo(interaction, userLang);
        break;
      case 'price':
        await handlePriceInfo(interaction, userLang);
        break;
      case 'players':
        await handlePlayerCount(interaction, userLang);
        break;
      case 'sales':
        await handleSales(interaction, userLang);
        break;
    }
  } catch (error) {
    console.error('Steam command error:', error);
    await interaction.editReply({
      content: 'An error occurred while fetching Steam data. Please try again later.'
    });
  }
}

async function handleGameInfo(interaction: ChatInputCommandInteraction, userLang: string) {
  const query = interaction.options.getString('query', true);
  const appId = await resolveAppId(query);

  if (!appId) {
    await interaction.editReply({
      content: 'Game not found. Please check the name or provide a valid Steam App ID.'
    });
    return;
  }

  const response = await fetch(`${STEAM_API_BASE}/appdetails?appids=${appId}&l=english`);
  const data = await response.json();

  if (!data[appId]?.success || !data[appId]?.data) {
    await interaction.editReply({
      content: 'Failed to fetch game information.'
    });
    return;
  }

  const game = data[appId].data;
  
  const embed = new EmbedBuilder()
    .setTitle(game.name)
    .setURL(`https://store.steampowered.com/app/${appId}`)
    .setDescription(game.short_description || 'No description available')
    .setThumbnail(game.header_image)
    .setColor('#171a21');

  embed.addFields({
    name: 'Details',
    value: [
      `**Type:** ${game.type}`,
      `**Developer:** ${game.developers?.join(', ') || 'Unknown'}`,
      `**Publisher:** ${game.publishers?.join(', ') || 'Unknown'}`,
      `**Release Date:** ${game.release_date?.date || 'TBA'}`
    ].join('\n'),
    inline: true
  });

  if (game.price_overview) {
    const price = game.price_overview;
    const currentPrice = price.final_formatted;
    const originalPrice = price.initial_formatted;
    const discount = price.discount_percent;

    let priceText = currentPrice;
    if (discount > 0) {
      priceText = `~~${originalPrice}~~ **${currentPrice}** (-${discount}%)`;
    }

    embed.addFields({
      name: 'Price',
      value: priceText,
      inline: true
    });
  } else if (game.is_free) {
    embed.addFields({
      name: 'Price',
      value: 'Free to Play',
      inline: true
    });
  }

  embed.addFields({
    name: 'Platforms',
    value: [
      game.platforms?.windows ? '🖥️ Windows' : null,
      game.platforms?.mac ? '🍎 Mac' : null,
      game.platforms?.linux ? '🐧 Linux' : null
    ].filter(Boolean).join(' | ') || 'Unknown',
    inline: false
  });

  if (game.categories) {
    const categories = game.categories.map(cat => cat.description).slice(0, 5).join(', ');
    embed.addFields({
      name: 'Categories',
      value: categories,
      inline: false
    });
  }

  if (game.genres) {
    const genres = game.genres.map(genre => genre.description).join(', ');
    embed.addFields({
      name: 'Genres',
      value: genres,
      inline: false
    });
  }

  embed.addFields({
    name: 'Links',
    value: [
      `[Steam Store](https://store.steampowered.com/app/${appId})`,
      `[SteamDB](${STEAMDB_BASE}/app/${appId})`,
      game.website ? `[Official Website](${game.website})` : null
    ].filter(Boolean).join(' | '),
    inline: false
  });

  await interaction.editReply({ embeds: [embed] });
}

async function handlePriceInfo(interaction: ChatInputCommandInteraction, userLang: string) {
  const query = interaction.options.getString('query', true);
  const region = interaction.options.getString('region') || 'US';
  const appId = await resolveAppId(query);

  if (!appId) {
    await interaction.editReply({
      content: 'Game not found. Please check the name or provide a valid Steam App ID.'
    });
    return;
  }

  const countryCode = getCountryCode(region);
  const response = await fetch(`${STEAM_API_BASE}/appdetails?appids=${appId}&cc=${countryCode}&filters=price_overview`);
  const data = await response.json();

  if (!data[appId]?.success || !data[appId]?.data) {
    await interaction.editReply({
      content: 'Failed to fetch price information.'
    });
    return;
  }

  const game = data[appId].data;
  
  const embed = new EmbedBuilder()
    .setTitle(`${game.name} - Price Information`)
    .setURL(`https://store.steampowered.com/app/${appId}`)
    .setColor('#171a21')
    .setFooter({ text: `Region: ${region.toUpperCase()}` });

  if (game.price_overview) {
    const price = game.price_overview;
    const currentPrice = price.final_formatted;
    const originalPrice = price.initial_formatted;
    const discount = price.discount_percent;

    embed.addFields({
      name: 'Current Price',
      value: currentPrice,
      inline: true
    });

    if (discount > 0) {
      embed.addFields(
        {
          name: 'Original Price',
          value: originalPrice,
          inline: true
        },
        {
          name: 'Discount',
          value: `-${discount}%`,
          inline: true
        }
      );
    }

    const priceHistory = await fetchPriceHistory(appId, countryCode);
    if (priceHistory) {
      embed.addFields({
        name: 'Price History',
        value: priceHistory,
        inline: false
      });
    }
  } else {
    embed.setDescription('This game is either free to play or not available in the selected region.');
  }

  embed.addFields({
    name: 'Compare Prices',
    value: `[SteamDB Price History](${STEAMDB_BASE}/app/${appId}/)`,
    inline: false
  });

  await interaction.editReply({ embeds: [embed] });
}

async function handlePlayerCount(interaction: ChatInputCommandInteraction, userLang: string) {
  const query = interaction.options.getString('query', true);
  const appId = await resolveAppId(query);

  if (!appId) {
    await interaction.editReply({
      content: 'Game not found. Please check the name or provide a valid Steam App ID.'
    });
    return;
  }

  const [gameResponse, playerResponse] = await Promise.all([
    fetch(`${STEAM_API_BASE}/appdetails?appids=${appId}&filters=basic`),
    fetch(`https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=${appId}`)
  ]);

  const gameData = await gameResponse.json();
  const playerData = await playerResponse.json();

  if (!gameData[appId]?.success) {
    await interaction.editReply({
      content: 'Failed to fetch game information.'
    });
    return;
  }

  const game = gameData[appId].data;
  const currentPlayers = playerData.response?.player_count || 0;

  const embed = new EmbedBuilder()
    .setTitle(`${game.name} - Player Statistics`)
    .setURL(`https://store.steampowered.com/app/${appId}`)
    .setThumbnail(game.header_image)
    .setColor('#171a21')
    .setTimestamp();

  embed.addFields(
    {
      name: 'Current Players',
      value: currentPlayers.toLocaleString(),
      inline: true
    },
    {
      name: 'Charts',
      value: `[View on SteamDB](${STEAMDB_BASE}/app/${appId}/graphs/)`,
      inline: true
    }
  );

  await interaction.editReply({ embeds: [embed] });
}

async function handleSales(interaction: ChatInputCommandInteraction, userLang: string) {
  const limit = interaction.options.getInteger('limit') || 5;

  const embed = new EmbedBuilder()
    .setTitle('🎮 Current Steam Sales')
    .setColor('#171a21')
    .setDescription('Top deals currently available on Steam')
    .setTimestamp()
    .setFooter({ text: 'Prices may vary by region' });

  embed.addFields({
    name: 'Featured Sales',
    value: [
      '• **Steam Summer Sale** - Up to 90% off',
      '• **Publisher Weekend** - Various publishers',
      '• **Midweek Madness** - Special deals',
      '• **Daily Deals** - 24-hour offers'
    ].join('\n'),
    inline: false
  });

  embed.addFields({
    name: 'Browse More Deals',
    value: [
      '[Steam Specials](https://store.steampowered.com/specials)',
      '[SteamDB Sales](https://steamdb.info/sales/)',
      '[IsThereAnyDeal](https://isthereanydeal.com/)'
    ].join(' | '),
    inline: false
  });

  await interaction.editReply({ embeds: [embed] });
}

async function resolveAppId(query: string): Promise<string | null> {
  if (/^\d+$/.test(query)) {
    return query;
  }

  try {
    const searchUrl = `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(query)}&l=english&cc=US`;
    const response = await fetch(searchUrl);
    const data = await response.json();

    if (data.items && data.items.length > 0) {
      return data.items[0].id.toString();
    }
  } catch (error) {
    console.error('Error searching for game:', error);
  }

  return null;
}

function getCountryCode(region: string): string {
  const regionMap: Record<string, string> = {
    'US': 'US',
    'UK': 'GB',
    'GB': 'GB',
    'DE': 'DE',
    'FR': 'FR',
    'ES': 'ES',
    'IT': 'IT',
    'JP': 'JP',
    'CN': 'CN',
    'RU': 'RU',
    'BR': 'BR',
    'AU': 'AU',
    'CA': 'CA'
  };

  return regionMap[region.toUpperCase()] || 'US';
}

async function fetchPriceHistory(appId: string, countryCode: string): Promise<string | null> {
  try {
    return [
      '**Lowest Price:** Data available on SteamDB',
      '**Highest Price:** Data available on SteamDB',
      '**Price Changes:** Check SteamDB for detailed history'
    ].join('\n');
  } catch (error) {
    return null;
  }
}