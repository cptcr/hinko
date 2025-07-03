import { 
  ButtonInteraction, 
  ChannelType, 
  PermissionFlagsBits,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  TextChannel,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ModalSubmitInteraction
} from 'discord.js';
import { prisma } from '../utils/database';
import { getUserLanguage, t } from '../utils/i18n';

export async function handleTicketButton(interaction: ButtonInteraction) {
  if (!interaction.guild || !interaction.member) return;

  const [action, data] = interaction.customId.split(':');
  
  if (action === 'ticket_create') {
    await handleTicketCreate(interaction, data);
  } else if (action === 'ticket_panel') {
    await handleTicketPanel(interaction, data);
  }
}

export async function handleTicketModal(interaction: ModalSubmitInteraction) {
  if (!interaction.guild || !interaction.channel) return;

  const [action, ticketId] = interaction.customId.split(':');
  
  if (action === 'ticket_close_modal') {
    await handleTicketCloseModal(interaction, parseInt(ticketId));
  }
}

async function handleTicketCreate(interaction: ButtonInteraction, systemId: string) {
  await interaction.deferReply({ ephemeral: true });

  const ticketSystem = await prisma.ticketSystem.findUnique({
    where: { id: systemId }
  });

  if (!ticketSystem || !ticketSystem.enabled) {
    await interaction.editReply({
      content: 'This ticket system is not available.'
    });
    return;
  }

  const existingTickets = await prisma.ticket.count({
    where: {
      userId: interaction.user.id,
      guildId: interaction.guild!.id,
      systemId: systemId,
      status: 'open'
    }
  });

  if (existingTickets >= ticketSystem.maxTicketsPerUser) {
    await interaction.editReply({
      content: `You already have ${existingTickets} open ticket(s). Maximum allowed: ${ticketSystem.maxTicketsPerUser}`
    });
    return;
  }

  const ticketNumber = await getNextTicketNumber(interaction.guild!.id);

  const category = interaction.guild!.channels.cache.get(ticketSystem.categoryId);
  if (!category || category.type !== ChannelType.GuildCategory) {
    await interaction.editReply({
      content: 'Ticket category not found. Please contact an administrator.'
    });
    return;
  }

  try {
    const channel = await interaction.guild!.channels.create({
      name: `ticket-${ticketNumber}`,
      type: ChannelType.GuildText,
      parent: category.id,
      permissionOverwrites: [
        {
          id: interaction.guild!.id,
          deny: [PermissionFlagsBits.ViewChannel]
        },
        {
          id: interaction.user.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.AttachFiles,
            PermissionFlagsBits.EmbedLinks
          ]
        },
        ...ticketSystem.supportRoleIds.map(roleId => ({
          id: roleId,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.AttachFiles,
            PermissionFlagsBits.EmbedLinks,
            PermissionFlagsBits.ManageMessages
          ]
        }))
      ]
    });

    const ticket = await prisma.ticket.create({
      data: {
        guildId: interaction.guild!.id,
        systemId: systemId,
        userId: interaction.user.id,
        channelId: channel.id,
        number: ticketNumber
      }
    });

    const welcomeEmbed = new EmbedBuilder()
      .setTitle(`Ticket #${ticketNumber}`)
      .setDescription(ticketSystem.welcomeMessage)
      .setColor('#7289da')
      .addFields(
        { name: 'Created by', value: interaction.user.toString(), inline: true },
        { name: 'Status', value: '🟢 Open', inline: true }
      )
      .setTimestamp();

    const claimButton = new ButtonBuilder()
      .setCustomId('ticket_panel:claim')
      .setLabel('Claim')
      .setEmoji('🎫')
      .setStyle(ButtonStyle.Primary);

    const lockButton = new ButtonBuilder()
      .setCustomId('ticket_panel:lock')
      .setLabel('Lock')
      .setEmoji('🔒')
      .setStyle(ButtonStyle.Secondary);

    const closeButton = new ButtonBuilder()
      .setCustomId('ticket_panel:close')
      .setLabel('Close')
      .setEmoji('🗑️')
      .setStyle(ButtonStyle.Danger);

    const row = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(claimButton, lockButton, closeButton);

    const mentionRoles = ticketSystem.supportRoleIds
      .map(id => `<@&${id}>`)
      .join(' ');

    await channel.send({
      content: `${interaction.user} ${mentionRoles}`,
      embeds: [welcomeEmbed],
      components: [row]
    });

    await interaction.editReply({
      content: `Your ticket has been created: ${channel}`
    });

  } catch (error) {
    console.error('Error creating ticket:', error);
    await interaction.editReply({
      content: 'Failed to create ticket. Please try again later.'
    });
  }
}

async function handleTicketPanel(interaction: ButtonInteraction, action: string) {
  const ticket = await prisma.ticket.findFirst({
    where: {
      channelId: interaction.channel!.id,
      guildId: interaction.guild!.id,
      status: 'open'
    },
    include: {
      system: true
    }
  });

  if (!ticket) return;

  const member = interaction.member;
  if (!member || typeof member.permissions === 'string') return;

  const memberRoles = member.roles;
  const hasRole = typeof memberRoles !== 'string' && 'cache' in memberRoles && 
    ticket.system.supportRoleIds.some(roleId => memberRoles.cache.has(roleId));

  const isSupport = hasRole || member.permissions.has(PermissionFlagsBits.ManageChannels);
  const isOwner = ticket.userId === interaction.user.id;

  switch (action) {
    case 'claim':
      if (!isSupport) {
        await interaction.reply({
          content: 'Only support staff can claim tickets.',
          ephemeral: true
        });
        return;
      }
      await handlePanelClaim(interaction, ticket);
      break;
    
    case 'lock':
      if (!isSupport) {
        await interaction.reply({
          content: 'Only support staff can lock tickets.',
          ephemeral: true
        });
        return;
      }
      await handlePanelLock(interaction, ticket);
      break;
    
    case 'close':
      if (!isSupport && !isOwner) {
        await interaction.reply({
          content: 'You do not have permission to close this ticket.',
          ephemeral: true
        });
        return;
      }
      await handlePanelClose(interaction, ticket);
      break;
  }
}

async function handlePanelClaim(interaction: ButtonInteraction, ticket: any) {
  if (ticket.claimedBy === interaction.user.id) {
    await prisma.ticket.update({
      where: { id: ticket.id },
      data: { claimedBy: null }
    });

    await interaction.reply({
      content: '🎫 You have unclaimed this ticket.',
      ephemeral: false
    });

    await updateTicketPanel(interaction, ticket, false);
  } else {
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

    await interaction.reply({
      content: `🎫 ${interaction.user} has claimed this ticket.`,
      ephemeral: false
    });

    await updateTicketPanel(interaction, ticket, true);
  }
}

async function handlePanelLock(interaction: ButtonInteraction, ticket: any) {
  const newLockState = !ticket.locked;

  await prisma.ticket.update({
    where: { id: ticket.id },
    data: { locked: newLockState }
  });

  const channel = interaction.channel as TextChannel;
  const ticketUser = await interaction.guild!.members.fetch(ticket.userId).catch(() => null);
  
  if (ticketUser) {
    await channel.permissionOverwrites.edit(ticketUser.id, {
      SendMessages: !newLockState
    });
  }

  await interaction.reply({
    content: newLockState ? '🔒 This ticket has been locked.' : '🔓 This ticket has been unlocked.',
    ephemeral: false
  });

  await updateTicketPanel(interaction, ticket, ticket.claimedBy !== null);
}

async function handlePanelClose(interaction: ButtonInteraction, ticket: any) {
  const modal = new ModalBuilder()
    .setCustomId(`ticket_close_modal:${ticket.id}`)
    .setTitle('Close Ticket');

  const reasonInput = new TextInputBuilder()
    .setCustomId('reason')
    .setLabel('Reason for closing (optional)')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setMaxLength(500);

  const row = new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput);
  modal.addComponents(row);

  await interaction.showModal(modal);
}

async function updateTicketPanel(interaction: ButtonInteraction, ticket: any, claimed: boolean) {
  const message = interaction.message;
  if (!message.embeds[0]) return;

  const embed = EmbedBuilder.from(message.embeds[0]);
  
  const fields = [
    { name: 'Created by', value: `<@${ticket.userId}>`, inline: true },
    { name: 'Status', value: ticket.locked ? '🔒 Locked' : '🟢 Open', inline: true }
  ];

  if (claimed && ticket.claimedBy) {
    fields.push({ name: 'Claimed by', value: `<@${ticket.claimedBy}>`, inline: true });
  }

  embed.setFields(fields);

  const claimButton = new ButtonBuilder()
    .setCustomId('ticket_panel:claim')
    .setLabel(claimed ? 'Unclaim' : 'Claim')
    .setEmoji('🎫')
    .setStyle(claimed ? ButtonStyle.Secondary : ButtonStyle.Primary);

  const lockButton = new ButtonBuilder()
    .setCustomId('ticket_panel:lock')
    .setLabel(ticket.locked ? 'Unlock' : 'Lock')
    .setEmoji(ticket.locked ? '🔓' : '🔒')
    .setStyle(ButtonStyle.Secondary);

  const closeButton = new ButtonBuilder()
    .setCustomId('ticket_panel:close')
    .setLabel('Close')
    .setEmoji('🗑️')
    .setStyle(ButtonStyle.Danger);

  const row = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(claimButton, lockButton, closeButton);

  await message.edit({ embeds: [embed], components: [row] });
}

async function getNextTicketNumber(guildId: string): Promise<number> {
  const lastTicket = await prisma.ticket.findFirst({
    where: { guildId: guildId },
    orderBy: { number: 'desc' }
  });

  return (lastTicket?.number || 0) + 1;
}

async function handleTicketCloseModal(interaction: ModalSubmitInteraction, ticketId: number) {
  const reason = interaction.fields.getTextInputValue('reason');
  
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: { system: true }
  });

  if (!ticket || ticket.status !== 'open') {
    await interaction.reply({
      content: 'Ticket not found or already closed.',
      ephemeral: true
    });
    return;
  }

  await prisma.ticket.update({
    where: { id: ticketId },
    data: {
      status: 'closed',
      closedBy: interaction.user.id,
      closedAt: new Date()
    }
  });

  const embed = new EmbedBuilder()
    .setTitle('🔒 Closing Ticket')
    .setDescription('This ticket will be closed in 5 seconds...')
    .setColor('#ff0000')
    .setFooter({ text: `Closed by ${interaction.user.tag}` });

  if (reason) {
    embed.addFields({ name: 'Reason', value: reason, inline: false });
  }

  await interaction.reply({ embeds: [embed] });

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

async function createTranscript(interaction: ModalSubmitInteraction | ButtonInteraction, ticket: any, reason?: string) {
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

  const buffer = Buffer.from(transcript || 'No messages recorded', 'utf-8');
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