import { 
  SlashCommandBuilder, 
  ChatInputCommandInteraction, 
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  PermissionFlagsBits
} from 'discord.js';
import { prisma } from '../../utils/database';
import { getUserLanguage, t } from '../../utils/i18n';

export const data = new SlashCommandBuilder()
  .setName('poll')
  .setDescription('Create a poll')
  .addStringOption(option =>
    option
      .setName('title')
      .setDescription('Poll title')
      .setRequired(true)
  )
  .addStringOption(option =>
    option
      .setName('options')
      .setDescription('Poll options separated by | (e.g., Option 1|Option 2|Option 3)')
      .setRequired(true)
  )
  .addStringOption(option =>
    option
      .setName('description')
      .setDescription('Poll description')
      .setRequired(false)
  )
  .addStringOption(option =>
    option
      .setName('image')
      .setDescription('Poll image URL')
      .setRequired(false)
  )
  .addIntegerOption(option =>
    option
      .setName('duration')
      .setDescription('Poll duration in hours (0 for no end time)')
      .setMinValue(0)
      .setMaxValue(168)
      .setRequired(false)
  )
  .addIntegerOption(option =>
    option
      .setName('max_votes')
      .setDescription('Maximum votes per user')
      .setMinValue(1)
      .setMaxValue(10)
      .setRequired(false)
  )
  .addBooleanOption(option =>
    option
      .setName('allow_change')
      .setDescription('Allow users to change their vote')
      .setRequired(false)
  )
  .addBooleanOption(option =>
    option
      .setName('show_results')
      .setDescription('Show results while voting is active')
      .setRequired(false)
  );

const optionEmojis = [
  '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣',
  '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟',
  '🇦', '🇧', '🇨', '🇩', '🇪',
  '🇫', '🇬', '🇭', '🇮', '🇯',
  '🇰', '🇱', '🇲', '🇳', '🇴'
];

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild || !interaction.channel) {
    await interaction.reply({
      content: 'This command can only be used in a server.',
      ephemeral: true
    });
    return;
  }

  await interaction.deferReply();

  const title = interaction.options.getString('title', true);
  const optionsString = interaction.options.getString('options', true);
  const description = interaction.options.getString('description');
  const imageUrl = interaction.options.getString('image');
  const duration = interaction.options.getInteger('duration') || 0;
  const maxVotes = interaction.options.getInteger('max_votes') || 1;
  const allowChange = interaction.options.getBoolean('allow_change') ?? true;
  const showResults = interaction.options.getBoolean('show_results') ?? true;

  const options = optionsString.split('|').map(opt => opt.trim()).filter(opt => opt.length > 0);

  if (options.length < 2) {
    await interaction.editReply({
      content: 'Please provide at least 2 options for the poll.'
    });
    return;
  }

  if (options.length > 25) {
    await interaction.editReply({
      content: 'Maximum 25 options allowed per poll.'
    });
    return;
  }

  const endTime = duration > 0 ? new Date(Date.now() + duration * 60 * 60 * 1000) : null;

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setColor('#7289da')
    .setFooter({ 
      text: `Created by ${interaction.user.tag}`,
      iconURL: interaction.user.displayAvatarURL()
    })
    .setTimestamp();

  if (description) {
    embed.setDescription(description);
  }

  if (imageUrl) {
    try {
      embed.setImage(imageUrl);
    } catch (error) {
      console.error('Invalid image URL:', error);
    }
  }

  const pollOptions: { label: string; emoji: string; votes: number }[] = [];
  
  options.forEach((option, index) => {
    const emoji = optionEmojis[index] || `${index + 1}`;
    pollOptions.push({ label: option, emoji, votes: 0 });
  });

  if (showResults) {
    updatePollEmbed(embed, pollOptions, endTime, maxVotes, 0);
  } else {
    embed.addFields({
      name: 'Options',
      value: pollOptions.map(opt => `${opt.emoji} ${opt.label}`).join('\n'),
      inline: false
    });
    
    if (endTime) {
      embed.addFields({
        name: 'Ends',
        value: `<t:${Math.floor(endTime.getTime() / 1000)}:R>`,
        inline: true
      });
    }
    
    embed.addFields({
      name: 'Settings',
      value: [
        `Max votes per user: ${maxVotes}`,
        `Vote changing: ${allowChange ? 'Allowed' : 'Not allowed'}`,
        `Live results: ${showResults ? 'Visible' : 'Hidden'}`
      ].join('\n'),
      inline: true
    });
  }

  const buttons: ButtonBuilder[] = [];
  const actionRows: ActionRowBuilder<ButtonBuilder>[] = [];

  pollOptions.forEach((option, index) => {
    const button = new ButtonBuilder()
      .setCustomId(`poll_vote:${index}`)
      .setLabel(option.label)
      .setEmoji(option.emoji)
      .setStyle(ButtonStyle.Primary);
    
    buttons.push(button);
  });

  for (let i = 0; i < buttons.length; i += 5) {
    const row = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(buttons.slice(i, i + 5));
    actionRows.push(row);
  }

  const controlRow = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('poll_results')
        .setLabel('View Results')
        .setEmoji('📊')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('poll_participants')
        .setLabel('View Participants')
        .setEmoji('👥')
        .setStyle(ButtonStyle.Secondary)
    );

  actionRows.push(controlRow);

  await interaction.editReply({
    embeds: [embed],
    components: actionRows
  });

  // For deferred replies, we need to fetch the reply to get the message
  const message = await interaction.fetchReply();
  const messageId = message.id;

  const poll = await prisma.poll.create({
    data: {
      guildId: interaction.guild.id,
      messageId: messageId,
      channelId: interaction.channel.id,
      creatorId: interaction.user.id,
      title: title,
      description: description || undefined,
      imageUrl: imageUrl || undefined,
      endTime: endTime,
      maxVotes: maxVotes,
      allowChange: allowChange,
      showResults: showResults,
      options: {
        create: pollOptions.map((opt, index) => ({
          optionId: index,
          label: opt.label,
          emoji: opt.emoji || undefined
        }))
      }
    }
  });

  if (duration > 0) {
    // Store poll end time in database, a cron job or separate process should handle ending polls
    console.log(`Poll ${messageId} will end in ${duration} hours`);
  }
}

function updatePollEmbed(
  embed: EmbedBuilder, 
  options: { label: string; emoji: string; votes: number }[],
  endTime: Date | null,
  maxVotes: number,
  totalVotes: number
) {
  const maxVoteCount = Math.max(...options.map(o => o.votes), 1);
  
  const optionFields = options.map(opt => {
    const percentage = totalVotes > 0 ? (opt.votes / totalVotes * 100).toFixed(1) : '0.0';
    const barLength = Math.round((opt.votes / maxVoteCount) * 20);
    const bar = '█'.repeat(barLength) + '░'.repeat(20 - barLength);
    
    return `${opt.emoji} **${opt.label}**\n${bar} ${opt.votes} votes (${percentage}%)`;
  });

  const chunkedFields: string[] = [];
  for (let i = 0; i < optionFields.length; i += 5) {
    chunkedFields.push(optionFields.slice(i, i + 5).join('\n\n'));
  }

  embed.setFields();
  
  chunkedFields.forEach((chunk, index) => {
    embed.addFields({
      name: index === 0 ? `Results (${totalVotes} total votes)` : '\u200b',
      value: chunk,
      inline: false
    });
  });

  if (endTime) {
    embed.addFields({
      name: 'Ends',
      value: `<t:${Math.floor(endTime.getTime() / 1000)}:R>`,
      inline: true
    });
  }

  embed.addFields({
    name: 'Max Votes',
    value: `${maxVotes} per user`,
    inline: true
  });
}

async function endPoll(guildId: string, messageId: string) {
  try {
    const poll = await prisma.poll.findUnique({
      where: { messageId },
      include: {
        options: {
          include: {
            votes: true
          }
        }
      }
    });

    if (!poll || !poll.active) return;

    await prisma.poll.update({
      where: { id: poll.id },
      data: { active: false }
    });

    // This would need to be passed from the bot client instance
    // For now, we'll just update the database
    console.log(`Poll ${poll.id} ended automatically`);
  } catch (error) {
    console.error('Error ending poll:', error);
  }
}