import { 
  SlashCommandBuilder, 
  ChatInputCommandInteraction, 
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  PermissionFlagsBits,
  ChannelType,
  TextChannel
} from 'discord.js';
import { prisma } from '../../utils/database';
import { getUserLanguage, t } from '../../utils/i18n';

export const data = new SlashCommandBuilder()
  .setName('ticket')
  .setDescription('Manage tickets')
  .addSubcommand(subcommand =>
    subcommand
      .setName('close')
      .setDescription('Close the current ticket')
      .addStringOption(option =>
        option
          .setName('reason')
          .setDescription('Reason for closing')
          .setRequired(false)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('add')
      .setDescription('Add a user to the ticket')
      .addUserOption(option =>
        option
          .setName('user')
          .setDescription('User to add')
          .setRequired(true)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('remove')
      .setDescription('Remove a user from the ticket')
      .addUserOption(option =>
        option
          .setName('user')
          .setDescription('User to remove')
          .setRequired(true)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('claim')
      .setDescription('Claim the ticket')
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('unclaim')
      .setDescription('Unclaim the ticket')
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('lock')
      .setDescription('Lock/unlock the ticket')
      .addBooleanOption(option =>
        option
          .setName('lock')
          .setDescription('Lock the ticket?')
          .setRequired(true)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('rename')
      .setDescription('Rename the ticket')
      .addStringOption(option =>
        option
          .setName('name')
          .setDescription('New name for the ticket')
          .setRequired(true)
      )
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild || !interaction.channel) {
    await interaction.reply({
      content: 'This command can only be used in a server.',
      ephemeral: true
    });
    return;
  }

  const ticket = await prisma.ticket.findFirst({
    where: {
      channelId: interaction.channel.id,
      guildId: interaction.guild.id,
      status: 'open'
    },
    include: {
      system: true
    }
  });

  if (!ticket) {
    await interaction.reply({
      content: 'This command can only be used in a ticket channel.',
      ephemeral: true
    });
    return;
  }

  const subcommand = interaction.options.getSubcommand();
  const userLang = await getUserLanguage(interaction.user.id, interaction.guild.id);

  const member = interaction.member;
  if (!member || typeof member.permissions === 'string') return;

  const memberRoles = member.roles;
  if (typeof memberRoles === 'string' || !('cache' in memberRoles)) return;

  const isSupport = ticket.system.supportRoleIds.some(roleId => 
    memberRoles.cache.has(roleId)
  ) || member.permissions.has(PermissionFlagsBits.ManageChannels);

  switch (subcommand) {
    case 'close':
      await handleClose(interaction, ticket, userLang);
      break;
    case 'add':
      if (!isSupport && ticket.userId !== interaction.user.id) {
        await interaction.reply({
          content: 'You do not have permission to manage this ticket.',
          ephemeral: true
        });
        return;
      }
      await handleAdd(interaction, ticket, userLang);
      break;
    case 'remove':
      if (!isSupport) {
        await interaction.reply({
          content: 'Only support staff can remove users from tickets.',
          ephemeral: true
        });
        return;
      }
      await handleRemove(interaction, ticket, userLang);
      break;
    case 'claim':
      if (!isSupport) {
        await interaction.reply({
          content: 'Only support staff can claim tickets.',
          ephemeral: true
        });
        return;
      }
      await handleClaim(interaction, ticket, userLang);
      break;
    case 'unclaim':
      if (!isSupport) {
        await interaction.reply({
          content: 'Only support staff can unclaim tickets.',
          ephemeral: true
        });
        return;
      }
      await handleUnclaim(interaction, ticket, userLang);
      break;
    case 'lock':
      if (!isSupport) {
        await interaction.reply({
          content: 'Only support staff can lock/unlock tickets.',
          ephemeral: true
        });
        return;
      }
      await handleLock(interaction, ticket, userLang);
      break;
    case 'rename':
      if (!isSupport && ticket.userId !== interaction.user.id) {
        await interaction.reply({
          content: 'You do not have permission to rename this ticket.',
          ephemeral: true
        });
        return;
      }
      await handleRename(interaction, ticket, userLang);
      break;
  }
}

async function handleClose(interaction: ChatInputCommandInteraction, ticket: any, userLang: string) {
  const reason = interaction.options.getString('reason');

  const embed = new EmbedBuilder()
    .setTitle('🔒 Closing Ticket')
    .setDescription('This ticket will be closed in 5 seconds...')
    .setColor('#ff0000')
    .setFooter({ text: `Closed by ${interaction.user.tag}` });

  if (reason) {
    embed.addFields({ name: 'Reason', value: reason, inline: false });
  }

  await interaction.reply({ embeds: [embed] });

  await prisma.ticket.update({
    where: { id: ticket.id },
    data: {
      status: 'closed',
      closedBy: interaction.user.id,
      closedAt: new Date()
    }
  });

  if (ticket.system.transcriptChannel) {
    await createTranscript(interaction, ticket, reason);
  }

  setTimeout(async () => {
    try {
      const channel = interaction.channel as TextChannel;
      await channel.delete();
    } catch (error) {
      console.error('Failed to delete ticket channel:', error);
    }
  }, 5000);
}

async function handleAdd(interaction: ChatInputCommandInteraction, ticket: any, userLang: string) {
  const user = interaction.options.getUser('user', true);
  const channel = interaction.channel as TextChannel;

  try {
    await channel.permissionOverwrites.create(user.id, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true,
      AttachFiles: true,
      EmbedLinks: true
    });

    const embed = new EmbedBuilder()
      .setDescription(`✅ ${user} has been added to the ticket.`)
      .setColor('#00ff00');

    await interaction.reply({ embeds: [embed] });
  } catch (error) {
    await interaction.reply({
      content: 'Failed to add user to the ticket.',
      ephemeral: true
    });
  }
}

async function handleRemove(interaction: ChatInputCommandInteraction, ticket: any, userLang: string) {
  const user = interaction.options.getUser('user', true);
  const channel = interaction.channel as TextChannel;

  if (user.id === ticket.userId) {
    await interaction.reply({
      content: 'Cannot remove the ticket creator.',
      ephemeral: true
    });
    return;
  }

  try {
    await channel.permissionOverwrites.delete(user.id);

    const embed = new EmbedBuilder()
      .setDescription(`✅ ${user} has been removed from the ticket.`)
      .setColor('#ff0000');

    await interaction.reply({ embeds: [embed] });
  } catch (error) {
    await interaction.reply({
      content: 'Failed to remove user from the ticket.',
      ephemeral: true
    });
  }
}

async function handleClaim(interaction: ChatInputCommandInteraction, ticket: any, userLang: string) {
  if (ticket.claimedBy) {
    await interaction.reply({
      content: `This ticket is already claimed by <@${ticket.claimedBy}>.`,
      ephemeral: true
    });
    return;
  }

  await prisma.ticket.update({
    where: { id: ticket.id },
    data: { claimedBy: interaction.user.id }
  });

  const embed = new EmbedBuilder()
    .setDescription(`🎫 ${interaction.user} has claimed this ticket.`)
    .setColor('#00ff00');

  await interaction.reply({ embeds: [embed] });
}

async function handleUnclaim(interaction: ChatInputCommandInteraction, ticket: any, userLang: string) {
  if (!ticket.claimedBy) {
    await interaction.reply({
      content: 'This ticket is not claimed.',
      ephemeral: true
    });
    return;
  }

  if (ticket.claimedBy !== interaction.user.id) {
    const member = interaction.member;
    if (!member || typeof member.permissions === 'string') return;
    
    if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({
        content: 'Only the claiming staff member or administrators can unclaim this ticket.',
        ephemeral: true
      });
      return;
    }
  }

  await prisma.ticket.update({
    where: { id: ticket.id },
    data: { claimedBy: null }
  });

  const embed = new EmbedBuilder()
    .setDescription(`🎫 This ticket has been unclaimed.`)
    .setColor('#ff9900');

  await interaction.reply({ embeds: [embed] });
}

async function handleLock(interaction: ChatInputCommandInteraction, ticket: any, userLang: string) {
  const lock = interaction.options.getBoolean('lock', true);
  const channel = interaction.channel as TextChannel;

  await prisma.ticket.update({
    where: { id: ticket.id },
    data: { locked: lock }
  });

  const ticketUser = await interaction.guild!.members.fetch(ticket.userId).catch(() => null);
  
  if (ticketUser) {
    await channel.permissionOverwrites.edit(ticketUser.id, {
      SendMessages: !lock
    });
  }

  const embed = new EmbedBuilder()
    .setDescription(lock ? '🔒 This ticket has been locked.' : '🔓 This ticket has been unlocked.')
    .setColor(lock ? '#ff0000' : '#00ff00');

  await interaction.reply({ embeds: [embed] });
}

async function handleRename(interaction: ChatInputCommandInteraction, ticket: any, userLang: string) {
  const newName = interaction.options.getString('name', true);
  const channel = interaction.channel as TextChannel;

  try {
    await channel.setName(newName);

    const embed = new EmbedBuilder()
      .setDescription(`✅ Ticket renamed to **${newName}**.`)
      .setColor('#00ff00');

    await interaction.reply({ embeds: [embed] });
  } catch (error) {
    await interaction.reply({
      content: 'Failed to rename the ticket. Please check the name and try again.',
      ephemeral: true
    });
  }
}

async function createTranscript(interaction: ChatInputCommandInteraction, ticket: any, reason?: string | null) {
  if (!ticket.system.transcriptChannel) return;

  const transcriptChannel = interaction.guild!.channels.cache.get(ticket.system.transcriptChannel) as TextChannel;
  if (!transcriptChannel) return;

  const messages = await prisma.ticketMessage.findMany({
    where: { ticketId: ticket.id },
    orderBy: { createdAt: 'asc' }
  });

  const ticketUser = await interaction.client.users.fetch(ticket.userId).catch(() => null);

  const embed = new EmbedBuilder()
    .setTitle(`Ticket #${ticket.number} - Transcript`)
    .setColor('#7289da')
    .addFields(
      { name: 'User', value: ticketUser ? ticketUser.tag : 'Unknown', inline: true },
      { name: 'Closed by', value: interaction.user.tag, inline: true },
      { name: 'Total Messages', value: messages.length.toString(), inline: true }
    )
    .setTimestamp();

  if (reason) {
    embed.addFields({ name: 'Close Reason', value: reason, inline: false });
  }

  if (ticket.claimedBy) {
    const claimedBy = await interaction.client.users.fetch(ticket.claimedBy).catch(() => null);
    embed.addFields({ name: 'Claimed by', value: claimedBy ? claimedBy.tag : 'Unknown', inline: true });
  }

  const transcript = messages.map(msg => {
    const timestamp = new Date(msg.createdAt).toLocaleString();
    return `[${timestamp}] ${msg.userId}: ${msg.content}`;
  }).join('\n');

  const buffer = Buffer.from(transcript, 'utf-8');
  const attachment = {
    attachment: buffer,
    name: `ticket-${ticket.number}-transcript.txt`
  };

  try {
    await transcriptChannel.send({
      embeds: [embed],
      files: [attachment]
    });
  } catch (error) {
    console.error('Failed to send transcript:', error);
  }
}