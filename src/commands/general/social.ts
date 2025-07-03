import { 
  SlashCommandBuilder, 
  ChatInputCommandInteraction, 
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ComponentType,
  AttachmentBuilder
} from 'discord.js';
import { prisma } from '../../utils/database';
import { getUserLanguage, t } from '../../utils/i18n';

export const data = new SlashCommandBuilder()
  .setName('social')
  .setDescription('Social interaction commands')
  .addSubcommand(subcommand =>
    subcommand
      .setName('hug')
      .setDescription('Give someone a warm hug')
      .addUserOption(option =>
        option
          .setName('user')
          .setDescription('User to hug')
          .setRequired(true)
      )
      .addStringOption(option =>
        option
          .setName('message')
          .setDescription('Optional message with your hug')
          .setRequired(false)
          .setMaxLength(200)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('highfive')
      .setDescription('High five someone')
      .addUserOption(option =>
        option
          .setName('user')
          .setDescription('User to high five')
          .setRequired(true)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('pat')
      .setDescription('Give someone a pat')
      .addUserOption(option =>
        option
          .setName('user')
          .setDescription('User to pat')
          .setRequired(true)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('wave')
      .setDescription('Wave at someone')
      .addUserOption(option =>
        option
          .setName('user')
          .setDescription('User to wave at')
          .setRequired(false)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('poke')
      .setDescription('Poke someone to get their attention')
      .addUserOption(option =>
        option
          .setName('user')
          .setDescription('User to poke')
          .setRequired(true)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('dance')
      .setDescription('Start dancing or dance with someone')
      .addUserOption(option =>
        option
          .setName('user')
          .setDescription('User to dance with')
          .setRequired(false)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('kiss')
      .setDescription('Give someone a kiss')
      .addUserOption(option =>
        option
          .setName('user')
          .setDescription('User to kiss')
          .setRequired(true)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('slap')
      .setDescription('Playfully slap someone')
      .addUserOption(option =>
        option
          .setName('user')
          .setDescription('User to slap')
          .setRequired(true)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('stats')
      .setDescription('View your social interaction statistics')
      .addUserOption(option =>
        option
          .setName('user')
          .setDescription('View stats for specific user')
          .setRequired(false)
      )
  );

export const category = 'general';

const socialActions = {
  hug: {
    emoji: '🤗',
    color: '#ff69b4',
    gifs: [
      'https://tenor.com/view/hug-virtual-hug-love-gif-12617579',
      'https://tenor.com/view/anime-hug-gif-9200932'
    ]
  },
  highfive: {
    emoji: '🙏',
    color: '#ffa500',
    gifs: [
      'https://tenor.com/view/high-five-gif-8560221'
    ]
  },
  pat: {
    emoji: '👋',
    color: '#87ceeb',
    gifs: [
      'https://tenor.com/view/anime-pat-head-gif-9200944'
    ]
  },
  wave: {
    emoji: '👋',
    color: '#ffff00',
    gifs: []
  },
  poke: {
    emoji: '👉',
    color: '#98fb98',
    gifs: []
  },
  dance: {
    emoji: '💃',
    color: '#da70d6',
    gifs: []
  },
  kiss: {
    emoji: '😘',
    color: '#ff1493',
    gifs: []
  },
  slap: {
    emoji: '👋',
    color: '#ff4500',
    gifs: []
  }
};

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

  if (subcommand === 'stats') {
    await handleSocialStats(interaction, userLang);
    return;
  }

  const targetUser = interaction.options.getUser('user');
  
  if (subcommand !== 'wave' && subcommand !== 'dance' && !targetUser) {
    await interaction.reply({
      content: 'Please specify a user for this action!',
      ephemeral: true
    });
    return;
  }

  if (targetUser && targetUser.id === interaction.user.id && subcommand !== 'dance') {
    const selfActions = {
      hug: 'You hug yourself... feeling lonely? 🤗',
      pat: 'You pat yourself on the back! Good job! 👏',
      wave: 'You wave at yourself in the mirror! 👋',
      poke: 'You poke yourself... ouch! 👉',
      kiss: 'You blow yourself a kiss! 😘💋',
      slap: 'You slap yourself... that had to hurt! 😵',
      highfive: 'You high five yourself... awkward but effective! 🙏'
    };

    await interaction.reply({
      content: selfActions[subcommand as keyof typeof selfActions] || 'You do something to yourself!',
      ephemeral: true
    });
    return;
  }

  if (targetUser && targetUser.bot) {
    await interaction.reply({
      content: 'Bots don\'t understand social interactions, but they appreciate the gesture! 🤖',
      ephemeral: true
    });
    return;
  }

  await handleSocialAction(interaction, subcommand, targetUser, userLang);
}

async function handleSocialAction(
  interaction: ChatInputCommandInteraction,
  action: string,
  targetUser: any,
  userLang: string
) {
  const actionData = socialActions[action as keyof typeof socialActions];
  const message = interaction.options.getString('message');
  
  let description = '';
  
  switch (action) {
    case 'hug':
      description = targetUser 
        ? `${interaction.user} gives ${targetUser} a warm hug! ${actionData.emoji}`
        : `${interaction.user} spreads hugs to everyone! ${actionData.emoji}`;
      break;
    case 'highfive':
      description = `${interaction.user} high fives ${targetUser}! ${actionData.emoji}`;
      break;
    case 'pat':
      description = `${interaction.user} gently pats ${targetUser} ${actionData.emoji}`;
      break;
    case 'wave':
      description = targetUser 
        ? `${interaction.user} waves at ${targetUser}! ${actionData.emoji}`
        : `${interaction.user} waves to everyone! ${actionData.emoji}`;
      break;
    case 'poke':
      description = `${interaction.user} pokes ${targetUser} to get their attention! ${actionData.emoji}`;
      break;
    case 'dance':
      description = targetUser 
        ? `${interaction.user} starts dancing with ${targetUser}! ${actionData.emoji}💃`
        : `${interaction.user} starts dancing! ${actionData.emoji}`;
      break;
    case 'kiss':
      description = `${interaction.user} gives ${targetUser} a kiss! ${actionData.emoji}`;
      break;
    case 'slap':
      description = `${interaction.user} playfully slaps ${targetUser}! ${actionData.emoji}`;
      break;
  }

  if (message) {
    description += `\n\n*"${message}"*`;
  }

  const embed = new EmbedBuilder()
    .setDescription(description)
    .setColor(actionData.color as any)
    .setTimestamp();

  if (targetUser) {
    embed.setThumbnail(targetUser.displayAvatarURL({ size: 128 }));
  }

  const reactionButton = new ButtonBuilder()
    .setCustomId(`social_react:${action}:${interaction.user.id}`)
    .setEmoji('❤️')
    .setLabel('React')
    .setStyle(ButtonStyle.Secondary);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(reactionButton);

  await interaction.reply({
    embeds: [embed],
    components: [row]
  });

  await prisma.socialInteraction.create({
    data: {
      guildId: interaction.guild!.id,
      senderId: interaction.user.id,
      receiverId: targetUser?.id,
      action: action,
      message: message
    }
  });

  if (targetUser && targetUser.id !== interaction.user.id) {
    try {
      const dmEmbed = new EmbedBuilder()
        .setTitle(`${actionData.emoji} Social Interaction`)
        .setDescription(`${interaction.user.username} ${getActionPastTense(action)} you in **${interaction.guild!.name}**!`)
        .setColor(actionData.color as any)
        .setThumbnail(interaction.user.displayAvatarURL({ size: 128 }))
        .setTimestamp();

      if (message) {
        dmEmbed.addFields({ name: 'Message', value: message, inline: false });
      }

      await targetUser.send({ embeds: [dmEmbed] });
    } catch (error) {
      console.log(`Could not DM social interaction to ${targetUser.id}`);
    }
  }
}

async function handleSocialStats(interaction: ChatInputCommandInteraction, userLang: string) {
  const targetUser = interaction.options.getUser('user') || interaction.user;
  
  const [sent, received, topActions] = await Promise.all([
    prisma.socialInteraction.groupBy({
      by: ['action'],
      where: {
        guildId: interaction.guild!.id,
        senderId: targetUser.id
      },
      _count: { action: true },
      orderBy: { _count: { action: 'desc' } }
    }),
    prisma.socialInteraction.groupBy({
      by: ['action'],
      where: {
        guildId: interaction.guild!.id,
        receiverId: targetUser.id
      },
      _count: { action: true },
      orderBy: { _count: { action: 'desc' } }
    }),
    prisma.socialInteraction.findMany({
      where: {
        guildId: interaction.guild!.id,
        OR: [
          { senderId: targetUser.id },
          { receiverId: targetUser.id }
        ]
      },
      orderBy: { createdAt: 'desc' },
      take: 5
    })
  ]);

  const totalSent = sent.reduce((sum, action) => sum + action._count.action, 0);
  const totalReceived = received.reduce((sum, action) => sum + action._count.action, 0);

  const embed = new EmbedBuilder()
    .setTitle(`📊 ${targetUser.username}'s Social Stats`)
    .setColor('#7289da')
    .setThumbnail(targetUser.displayAvatarURL({ size: 128 }))
    .addFields(
      {
        name: '📤 Actions Sent',
        value: totalSent > 0 
          ? sent.map(a => `${socialActions[a.action as keyof typeof socialActions]?.emoji || '❓'} ${a.action}: ${a._count.action}`).join('\n')
          : 'No actions sent yet',
        inline: true
      },
      {
        name: '📥 Actions Received',
        value: totalReceived > 0
          ? received.map(a => `${socialActions[a.action as keyof typeof socialActions]?.emoji || '❓'} ${a.action}: ${a._count.action}`).join('\n')
          : 'No actions received yet',
        inline: true
      },
      {
        name: '📈 Summary',
        value: `**Total Sent:** ${totalSent}\n**Total Received:** ${totalReceived}\n**Total Interactions:** ${totalSent + totalReceived}`,
        inline: false
      }
    )
    .setFooter({ text: `Stats for ${interaction.guild!.name}` })
    .setTimestamp();

  if (topActions.length > 0) {
    const recentActions = topActions.map(action => {
      const emoji = socialActions[action.action as keyof typeof socialActions]?.emoji || '❓';
      const timeStr = `<t:${Math.floor(action.createdAt.getTime() / 1000)}:R>`;
      
      if (action.senderId === targetUser.id) {
        return `${emoji} Sent ${action.action} ${timeStr}`;
      } else {
        return `${emoji} Received ${action.action} ${timeStr}`;
      }
    }).join('\n');

    embed.addFields({
      name: '🕐 Recent Activity',
      value: recentActions,
      inline: false
    });
  }

  await interaction.reply({ embeds: [embed] });
}

function getActionPastTense(action: string): string {
  const pastTense = {
    hug: 'hugged',
    highfive: 'high fived',
    pat: 'patted',
    wave: 'waved at',
    poke: 'poked',
    dance: 'danced with',
    kiss: 'kissed',
    slap: 'slapped'
  };
  
  return pastTense[action as keyof typeof pastTense] || action;
}