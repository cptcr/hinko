import { 
  SlashCommandBuilder, 
  ChatInputCommandInteraction, 
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ComponentType,
  PermissionFlagsBits,
  ChannelType
} from 'discord.js';
import { prisma } from '../../utils/database';
import { getUserLanguage, t } from '../../utils/i18n';

export const data = new SlashCommandBuilder()
  .setName('community')
  .setDescription('Community features and social commands')
  .addSubcommand(subcommand =>
    subcommand
      .setName('confession')
      .setDescription('Submit an anonymous confession')
      .addStringOption(option =>
        option
          .setName('message')
          .setDescription('Your anonymous confession')
          .setRequired(true)
          .setMaxLength(1000)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('suggestion')
      .setDescription('Submit a suggestion for the server')
      .addStringOption(option =>
        option
          .setName('title')
          .setDescription('Brief title for your suggestion')
          .setRequired(true)
          .setMaxLength(100)
      )
      .addStringOption(option =>
        option
          .setName('description')
          .setDescription('Detailed description of your suggestion')
          .setRequired(true)
          .setMaxLength(1000)
      )
      .addStringOption(option =>
        option
          .setName('category')
          .setDescription('Category of suggestion')
          .setRequired(false)
          .addChoices(
            { name: 'General', value: 'general' },
            { name: 'Features', value: 'features' },
            { name: 'Events', value: 'events' },
            { name: 'Rules', value: 'rules' },
            { name: 'Channels', value: 'channels' },
            { name: 'Bots', value: 'bots' },
            { name: 'Other', value: 'other' }
          )
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('report')
      .setDescription('Report a user or issue to moderators')
      .addUserOption(option =>
        option
          .setName('user')
          .setDescription('User to report (optional)')
          .setRequired(false)
      )
      .addStringOption(option =>
        option
          .setName('reason')
          .setDescription('Reason for the report')
          .setRequired(true)
          .setMaxLength(500)
      )
      .addStringOption(option =>
        option
          .setName('evidence')
          .setDescription('Additional evidence or context')
          .setRequired(false)
          .setMaxLength(500)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('compliment')
      .setDescription('Send a compliment to another user')
      .addUserOption(option =>
        option
          .setName('user')
          .setDescription('User to compliment')
          .setRequired(true)
      )
      .addStringOption(option =>
        option
          .setName('message')
          .setDescription('Your compliment message')
          .setRequired(true)
          .setMaxLength(300)
      )
      .addBooleanOption(option =>
        option
          .setName('anonymous')
          .setDescription('Send anonymously')
          .setRequired(false)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('quote')
      .setDescription('Save or retrieve quotes from the community')
      .addStringOption(option =>
        option
          .setName('action')
          .setDescription('What to do with quotes')
          .setRequired(true)
          .addChoices(
            { name: 'Add Quote', value: 'add' },
            { name: 'Random Quote', value: 'random' },
            { name: 'Search Quote', value: 'search' },
            { name: 'My Quotes', value: 'mine' }
          )
      )
      .addStringOption(option =>
        option
          .setName('text')
          .setDescription('Quote text (for add) or search term')
          .setRequired(false)
          .setMaxLength(500)
      )
      .addUserOption(option =>
        option
          .setName('author')
          .setDescription('Quote author (for add)')
          .setRequired(false)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('birthday')
      .setDescription('Manage birthday announcements')
      .addStringOption(option =>
        option
          .setName('action')
          .setDescription('Birthday action')
          .setRequired(true)
          .addChoices(
            { name: 'Set Birthday', value: 'set' },
            { name: 'Remove Birthday', value: 'remove' },
            { name: 'Today\'s Birthdays', value: 'today' },
            { name: 'Upcoming Birthdays', value: 'upcoming' }
          )
      )
      .addStringOption(option =>
        option
          .setName('date')
          .setDescription('Birthday date (MM-DD format, e.g., 03-15)')
          .setRequired(false)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('setup')
      .setDescription('Configure community features (Admin only)')
      .addStringOption(option =>
        option
          .setName('feature')
          .setDescription('Feature to configure')
          .setRequired(true)
          .addChoices(
            { name: 'Confession Channel', value: 'confession_channel' },
            { name: 'Suggestion Channel', value: 'suggestion_channel' },
            { name: 'Report Channel', value: 'report_channel' },
            { name: 'Birthday Channel', value: 'birthday_channel' },
            { name: 'Compliment Channel', value: 'compliment_channel' }
          )
      )
      .addChannelOption(option =>
        option
          .setName('channel')
          .setDescription('Channel for this feature')
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
          .setRequired(false)
      )
      .addBooleanOption(option =>
        option
          .setName('enable')
          .setDescription('Enable or disable the feature')
          .setRequired(false)
      )
  );

export const category = 'general';

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) {
    await interaction.reply({
      content: 'This command can only be used in a server.',
      ephemeral: true
    });
    return;
  }

  const subcommand = interaction.options.getSubcommand();
  const userLang = await getUserLanguage(interaction.user.id, interaction.guild.id);

  switch (subcommand) {
    case 'confession':
      await handleConfession(interaction, userLang);
      break;
    case 'suggestion':
      await handleSuggestion(interaction, userLang);
      break;
    case 'report':
      await handleReport(interaction, userLang);
      break;
    case 'compliment':
      await handleCompliment(interaction, userLang);
      break;
    case 'quote':
      await handleQuote(interaction, userLang);
      break;
    case 'birthday':
      await handleBirthday(interaction, userLang);
      break;
    case 'setup':
      await handleSetup(interaction, userLang);
      break;
  }
}

async function handleConfession(interaction: ChatInputCommandInteraction, userLang: string) {
  const message = interaction.options.getString('message', true);
  
  const settings = await prisma.communitySettings.findUnique({
    where: { guildId: interaction.guild!.id }
  });

  if (!settings?.confessionChannelId || !settings.confessionEnabled) {
    await interaction.reply({
      content: 'Confession feature is not set up or disabled. Ask an admin to configure it.',
      ephemeral: true
    });
    return;
  }

  const confessionChannel = interaction.guild!.channels.cache.get(settings.confessionChannelId);
  if (!confessionChannel || !('send' in confessionChannel)) {
    await interaction.reply({
      content: 'Confession channel not found. Please contact an admin.',
      ephemeral: true
    });
    return;
  }

  const confessionNumber = await getNextConfessionNumber(interaction.guild!.id);

  const embed = new EmbedBuilder()
    .setTitle(`💭 Anonymous Confession #${confessionNumber}`)
    .setDescription(message)
    .setColor('#9966cc')
    .setFooter({ text: 'Anonymous confession' })
    .setTimestamp();

  const voteButtons = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`confession_react:${confessionNumber}:💙`)
        .setEmoji('💙')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`confession_react:${confessionNumber}:😢`)
        .setEmoji('😢')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`confession_react:${confessionNumber}:😮`)
        .setEmoji('😮')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`confession_react:${confessionNumber}:❤️`)
        .setEmoji('❤️')
        .setStyle(ButtonStyle.Secondary)
    );

  await confessionChannel.send({ embeds: [embed], components: [voteButtons] });

  await prisma.confession.create({
    data: {
      guildId: interaction.guild!.id,
      userId: interaction.user.id,
      number: confessionNumber,
      content: message
    }
  });

  await interaction.reply({
    content: `✅ Your confession #${confessionNumber} has been posted anonymously!`,
    ephemeral: true
  });
}

async function handleSuggestion(interaction: ChatInputCommandInteraction, userLang: string) {
  const title = interaction.options.getString('title', true);
  const description = interaction.options.getString('description', true);
  const category = interaction.options.getString('category') || 'general';

  const settings = await prisma.communitySettings.findUnique({
    where: { guildId: interaction.guild!.id }
  });

  if (!settings?.suggestionChannelId || !settings.suggestionEnabled) {
    await interaction.reply({
      content: 'Suggestion feature is not set up or disabled. Ask an admin to configure it.',
      ephemeral: true
    });
    return;
  }

  const suggestionChannel = interaction.guild!.channels.cache.get(settings.suggestionChannelId);
  if (!suggestionChannel || !('send' in suggestionChannel)) {
    await interaction.reply({
      content: 'Suggestion channel not found. Please contact an admin.',
      ephemeral: true
    });
    return;
  }

  const suggestionNumber = await getNextSuggestionNumber(interaction.guild!.id);

  const embed = new EmbedBuilder()
    .setTitle(`💡 Suggestion #${suggestionNumber}: ${title}`)
    .setDescription(description)
    .setColor('#ffaa00')
    .addFields(
      { name: 'Category', value: category.charAt(0).toUpperCase() + category.slice(1), inline: true },
      { name: 'Status', value: '🔄 Pending Review', inline: true },
      { name: 'Suggested by', value: interaction.user.toString(), inline: true }
    )
    .setFooter({ text: `Suggestion ID: ${suggestionNumber}` })
    .setTimestamp();

  const voteButtons = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`suggestion_vote:${suggestionNumber}:upvote`)
        .setEmoji('👍')
        .setLabel('Upvote')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`suggestion_vote:${suggestionNumber}:downvote`)
        .setEmoji('👎')
        .setLabel('Downvote')
        .setStyle(ButtonStyle.Danger)
    );

  const suggestionMessage = await suggestionChannel.send({ 
    embeds: [embed], 
    components: [voteButtons] 
  });

  await prisma.suggestion.create({
    data: {
      guildId: interaction.guild!.id,
      userId: interaction.user.id,
      messageId: suggestionMessage.id,
      number: suggestionNumber,
      title: title,
      description: description,
      category: category,
      status: 'pending'
    }
  });

  await interaction.reply({
    content: `✅ Your suggestion #${suggestionNumber} has been submitted and is now open for voting!`,
    ephemeral: true
  });
}

async function handleReport(interaction: ChatInputCommandInteraction, userLang: string) {
  const reportedUser = interaction.options.getUser('user');
  const reason = interaction.options.getString('reason', true);
  const evidence = interaction.options.getString('evidence');

  const settings = await prisma.communitySettings.findUnique({
    where: { guildId: interaction.guild!.id }
  });

  if (!settings?.reportChannelId || !settings.reportEnabled) {
    await interaction.reply({
      content: 'Report feature is not set up or disabled. Ask an admin to configure it.',
      ephemeral: true
    });
    return;
  }

  const reportChannel = interaction.guild!.channels.cache.get(settings.reportChannelId);
  if (!reportChannel || !('send' in reportChannel)) {
    await interaction.reply({
      content: 'Report channel not found. Please contact an admin.',
      ephemeral: true
    });
    return;
  }

  const reportNumber = await getNextReportNumber(interaction.guild!.id);

  const embed = new EmbedBuilder()
    .setTitle(`🚨 Report #${reportNumber}`)
    .setColor('#ff0000')
    .addFields(
      { name: 'Reported by', value: interaction.user.toString(), inline: true },
      { name: 'Status', value: '🔴 Open', inline: true },
      { name: 'Reason', value: reason, inline: false }
    )
    .setFooter({ text: `Report ID: ${reportNumber}` })
    .setTimestamp();

  if (reportedUser) {
    embed.addFields({ name: 'Reported User', value: reportedUser.toString(), inline: true });
  }

  if (evidence) {
    embed.addFields({ name: 'Evidence/Context', value: evidence, inline: false });
  }

  const actionButtons = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`report_action:${reportNumber}:investigate`)
        .setLabel('Investigate')
        .setEmoji('🔍')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`report_action:${reportNumber}:resolve`)
        .setLabel('Resolve')
        .setEmoji('✅')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`report_action:${reportNumber}:dismiss`)
        .setLabel('Dismiss')
        .setEmoji('❌')
        .setStyle(ButtonStyle.Secondary)
    );

  await reportChannel.send({ embeds: [embed], components: [actionButtons] });

  await prisma.report.create({
    data: {
      guildId: interaction.guild!.id,
      reporterId: interaction.user.id,
      reportedUserId: reportedUser?.id,
      number: reportNumber,
      reason: reason,
      evidence: evidence,
      status: 'open'
    }
  });

  await interaction.reply({
    content: `✅ Your report #${reportNumber} has been submitted to the moderation team.`,
    ephemeral: true
  });
}

async function handleCompliment(interaction: ChatInputCommandInteraction, userLang: string) {
  const targetUser = interaction.options.getUser('user', true);
  const message = interaction.options.getString('message', true);
  const anonymous = interaction.options.getBoolean('anonymous') || false;

  if (targetUser.id === interaction.user.id) {
    await interaction.reply({
      content: 'You cannot compliment yourself! 😅',
      ephemeral: true
    });
    return;
  }

  if (targetUser.bot) {
    await interaction.reply({
      content: 'Bots appreciate the thought, but they don\'t need compliments! 🤖',
      ephemeral: true
    });
    return;
  }

  const settings = await prisma.communitySettings.findUnique({
    where: { guildId: interaction.guild!.id }
  });

  const embed = new EmbedBuilder()
    .setTitle('💖 Someone sent you a compliment!')
    .setDescription(message)
    .setColor('#ff69b4')
    .addFields(
      { name: 'To', value: targetUser.toString(), inline: true },
      { name: 'From', value: anonymous ? '🎭 Anonymous' : interaction.user.toString(), inline: true }
    )
    .setThumbnail(targetUser.displayAvatarURL({ size: 128 }))
    .setTimestamp();

  if (settings?.complimentChannelId && settings.complimentEnabled) {
    const complimentChannel = interaction.guild!.channels.cache.get(settings.complimentChannelId);
    if (complimentChannel && 'send' in complimentChannel) {
      await complimentChannel.send({ embeds: [embed] });
    }
  }

  try {
    await targetUser.send({ embeds: [embed] });
  } catch (error) {
    console.log(`Could not DM compliment to ${targetUser.id}`);
  }

  await prisma.compliment.create({
    data: {
      guildId: interaction.guild!.id,
      senderId: interaction.user.id,
      receiverId: targetUser.id,
      message: message,
      anonymous: anonymous
    }
  });

  await interaction.reply({
    content: `✅ Your compliment has been sent to ${targetUser.username}!`,
    ephemeral: true
  });
}

async function handleQuote(interaction: ChatInputCommandInteraction, userLang: string) {
  const action = interaction.options.getString('action', true);
  const text = interaction.options.getString('text');
  const author = interaction.options.getUser('author');

  switch (action) {
    case 'add':
      if (!text) {
        await interaction.reply({
          content: 'Please provide the quote text!',
          ephemeral: true
        });
        return;
      }

      const quote = await prisma.quote.create({
        data: {
          guildId: interaction.guild!.id,
          addedBy: interaction.user.id,
          text: text,
          authorId: author?.id,
          authorName: author?.username || 'Unknown'
        }
      });

      await interaction.reply({
        content: `✅ Quote #${quote.id} added successfully!`,
        ephemeral: true
      });
      break;

    case 'random':
      const randomQuote = await prisma.quote.findFirst({
        where: { guildId: interaction.guild!.id },
        orderBy: { createdAt: 'desc' },
        skip: Math.floor(Math.random() * await prisma.quote.count({
          where: { guildId: interaction.guild!.id }
        }))
      });

      if (!randomQuote) {
        await interaction.reply({
          content: 'No quotes found in this server!',
          ephemeral: true
        });
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle('📜 Random Quote')
        .setDescription(`"${randomQuote.text}"`)
        .setColor('#8b4513')
        .addFields({ name: 'Author', value: randomQuote.authorName, inline: true })
        .setFooter({ text: `Quote #${randomQuote.id}` })
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
      break;

    case 'search':
      if (!text) {
        await interaction.reply({
          content: 'Please provide a search term!',
          ephemeral: true
        });
        return;
      }

      const searchResults = await prisma.quote.findMany({
        where: {
          guildId: interaction.guild!.id,
          OR: [
            { text: { contains: text, mode: 'insensitive' } },
            { authorName: { contains: text, mode: 'insensitive' } }
          ]
        },
        take: 5,
        orderBy: { createdAt: 'desc' }
      });

      if (searchResults.length === 0) {
        await interaction.reply({
          content: `No quotes found matching "${text}"`,
          ephemeral: true
        });
        return;
      }

      const searchEmbed = new EmbedBuilder()
        .setTitle(`🔍 Search Results for "${text}"`)
        .setColor('#4169e1')
        .setDescription(searchResults.map(q => 
          `**#${q.id}** "${q.text}" - *${q.authorName}*`
        ).join('\n\n'))
        .setFooter({ text: `Found ${searchResults.length} quote(s)` });

      await interaction.reply({ embeds: [searchEmbed] });
      break;

    case 'mine':
      const userQuotes = await prisma.quote.findMany({
        where: {
          guildId: interaction.guild!.id,
          addedBy: interaction.user.id
        },
        take: 10,
        orderBy: { createdAt: 'desc' }
      });

      if (userQuotes.length === 0) {
        await interaction.reply({
          content: 'You haven\'t added any quotes yet!',
          ephemeral: true
        });
        return;
      }

      const myQuotesEmbed = new EmbedBuilder()
        .setTitle('📝 Your Quotes')
        .setColor('#32cd32')
        .setDescription(userQuotes.map(q => 
          `**#${q.id}** "${q.text}" - *${q.authorName}*`
        ).join('\n\n'))
        .setFooter({ text: `You've added ${userQuotes.length} quote(s)` });

      await interaction.reply({ embeds: [myQuotesEmbed], ephemeral: true });
      break;
  }
}

async function handleBirthday(interaction: ChatInputCommandInteraction, userLang: string) {
  const action = interaction.options.getString('action', true);
  const dateStr = interaction.options.getString('date');

  switch (action) {
    case 'set':
      if (!dateStr) {
        await interaction.reply({
          content: 'Please provide your birthday in MM-DD format (e.g., 03-15 for March 15th)!',
          ephemeral: true
        });
        return;
      }

      const dateRegex = /^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/;
      if (!dateRegex.test(dateStr)) {
        await interaction.reply({
          content: 'Invalid date format! Please use MM-DD (e.g., 03-15 for March 15th).',
          ephemeral: true
        });
        return;
      }

      await prisma.birthday.upsert({
        where: {
          userId_guildId: {
            userId: interaction.user.id,
            guildId: interaction.guild!.id
          }
        },
        update: { date: dateStr },
        create: {
          userId: interaction.user.id,
          guildId: interaction.guild!.id,
          date: dateStr
        }
      });

      await interaction.reply({
        content: `🎂 Your birthday has been set to ${dateStr}!`,
        ephemeral: true
      });
      break;

    case 'remove':
      const deleted = await prisma.birthday.deleteMany({
        where: {
          userId: interaction.user.id,
          guildId: interaction.guild!.id
        }
      });

      if (deleted.count > 0) {
        await interaction.reply({
          content: '✅ Your birthday has been removed from the system.',
          ephemeral: true
        });
      } else {
        await interaction.reply({
          content: 'You don\'t have a birthday set!',
          ephemeral: true
        });
      }
      break;

    case 'today':
      const today = new Date();
      const todayStr = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      
      const todayBirthdays = await prisma.birthday.findMany({
        where: {
          guildId: interaction.guild!.id,
          date: todayStr
        }
      });

      if (todayBirthdays.length === 0) {
        await interaction.reply({
          content: '🎂 No birthdays today!',
          ephemeral: true
        });
        return;
      }

      const todayEmbed = new EmbedBuilder()
        .setTitle('🎉 Today\'s Birthdays!')
        .setColor('#ffd700')
        .setDescription(todayBirthdays.map(b => `🎂 <@${b.userId}>`).join('\n'))
        .setTimestamp();

      await interaction.reply({ embeds: [todayEmbed] });
      break;

    case 'upcoming':
      const upcoming = await getUpcomingBirthdays(interaction.guild!.id, 7);
      
      if (upcoming.length === 0) {
        await interaction.reply({
          content: '🎂 No upcoming birthdays in the next 7 days!',
          ephemeral: true
        });
        return;
      }

      const upcomingEmbed = new EmbedBuilder()
        .setTitle('📅 Upcoming Birthdays (Next 7 days)')
        .setColor('#87ceeb')
        .setDescription(upcoming.map((b) => `${b.date}: <@${b.userId}>`).join('\n'))
        .setTimestamp();

      await interaction.reply({ embeds: [upcomingEmbed] });
      break;
  }
}

async function handleSetup(interaction: ChatInputCommandInteraction, userLang: string) {
  const member = interaction.member;
  if (!member || typeof member.permissions === 'string') return;

  if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({
      content: 'Only administrators can configure community features.',
      ephemeral: true
    });
    return;
  }

  const feature = interaction.options.getString('feature', true);
  const channel = interaction.options.getChannel('channel');
  const enable = interaction.options.getBoolean('enable');

  const settings = await prisma.communitySettings.upsert({
    where: { guildId: interaction.guild!.id },
    update: {},
    create: { 
      guildId: interaction.guild!.id,
      confessionEnabled: false,
      suggestionEnabled: false,
      reportEnabled: false,
      birthdayEnabled: false,
      complimentEnabled: false
    }
  });

  const updateData: any = {};

  switch (feature) {
    case 'confession_channel':
      updateData.confessionChannelId = channel?.id;
      if (enable !== null) updateData.confessionEnabled = enable;
      break;
    case 'suggestion_channel':
      updateData.suggestionChannelId = channel?.id;
      if (enable !== null) updateData.suggestionEnabled = enable;
      break;
    case 'report_channel':
      updateData.reportChannelId = channel?.id;
      if (enable !== null) updateData.reportEnabled = enable;
      break;
    case 'birthday_channel':
      updateData.birthdayChannelId = channel?.id;
      if (enable !== null) updateData.birthdayEnabled = enable;
      break;
    case 'compliment_channel':
      updateData.complimentChannelId = channel?.id;
      if (enable !== null) updateData.complimentEnabled = enable;
      break;
  }

  await prisma.communitySettings.update({
    where: { guildId: interaction.guild!.id },
    data: updateData
  });

  const featureName = feature.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
  await interaction.reply({
    content: `✅ ${featureName} has been configured successfully!`,
    ephemeral: true
  });
}

async function getNextConfessionNumber(guildId: string): Promise<number> {
  const lastConfession = await prisma.confession.findFirst({
    where: { guildId },
    orderBy: { number: 'desc' }
  });
  return (lastConfession?.number || 0) + 1;
}

async function getNextSuggestionNumber(guildId: string): Promise<number> {
  const lastSuggestion = await prisma.suggestion.findFirst({
    where: { guildId },
    orderBy: { number: 'desc' }
  });
  return (lastSuggestion?.number || 0) + 1;
}

async function getNextReportNumber(guildId: string): Promise<number> {
  const lastReport = await prisma.report.findFirst({
    where: { guildId },
    orderBy: { number: 'desc' }
  });
  return (lastReport?.number || 0) + 1;
}

async function getUpcomingBirthdays(guildId: string, days: number) {
  const today = new Date();
  const upcoming: any[] = [];
  
  for (let i = 1; i <= days; i++) {
    const checkDate = new Date(today);
    checkDate.setDate(today.getDate() + i);
    const dateStr = `${String(checkDate.getMonth() + 1).padStart(2, '0')}-${String(checkDate.getDate()).padStart(2, '0')}`;
    
    const birthdays = await prisma.birthday.findMany({
      where: { guildId, date: dateStr }
    });
    
    birthdays.forEach(b => upcoming.push({ ...b, date: dateStr }));
  }
  
  return upcoming;
}