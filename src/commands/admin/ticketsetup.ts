import { 
  SlashCommandBuilder, 
  ChatInputCommandInteraction, 
  ChannelType,
  PermissionFlagsBits,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ComponentType
} from 'discord.js';
import { prisma } from '../../utils/database';
import { getUserLanguage, t } from '../../utils/i18n';

export const data = new SlashCommandBuilder()
  .setName('ticketsetup')
  .setDescription('Setup a ticket system')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand(subcommand =>
    subcommand
      .setName('create')
      .setDescription('Create a new ticket system')
      .addStringOption(option =>
        option
          .setName('name')
          .setDescription('Name for this ticket system')
          .setRequired(true)
      )
      .addChannelOption(option =>
        option
          .setName('category')
          .setDescription('Category where tickets will be created')
          .addChannelTypes(ChannelType.GuildCategory)
          .setRequired(true)
      )
      .addRoleOption(option =>
        option
          .setName('support_role')
          .setDescription('Role that can manage tickets')
          .setRequired(true)
      )
      .addChannelOption(option =>
        option
          .setName('transcript_channel')
          .setDescription('Channel for ticket transcripts')
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(false)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('panel')
      .setDescription('Create a ticket panel')
      .addStringOption(option =>
        option
          .setName('system')
          .setDescription('Ticket system to use')
          .setRequired(true)
          .setAutocomplete(true)
      )
      .addChannelOption(option =>
        option
          .setName('channel')
          .setDescription('Channel to send the panel to')
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
          .setRequired(true)
      )
      .addStringOption(option =>
        option
          .setName('title')
          .setDescription('Panel title')
          .setRequired(false)
      )
      .addStringOption(option =>
        option
          .setName('description')
          .setDescription('Panel description')
          .setRequired(false)
      )
      .addStringOption(option =>
        option
          .setName('button_label')
          .setDescription('Button label')
          .setRequired(false)
      )
      .addStringOption(option =>
        option
          .setName('button_emoji')
          .setDescription('Button emoji')
          .setRequired(false)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('edit')
      .setDescription('Edit a ticket system')
      .addStringOption(option =>
        option
          .setName('system')
          .setDescription('Ticket system to edit')
          .setRequired(true)
          .setAutocomplete(true)
      )
      .addStringOption(option =>
        option
          .setName('welcome_message')
          .setDescription('Welcome message for new tickets')
          .setRequired(false)
      )
      .addIntegerOption(option =>
        option
          .setName('max_tickets')
          .setDescription('Maximum tickets per user')
          .setMinValue(1)
          .setMaxValue(10)
          .setRequired(false)
      )
      .addRoleOption(option =>
        option
          .setName('add_support_role')
          .setDescription('Add another support role')
          .setRequired(false)
      )
      .addRoleOption(option =>
        option
          .setName('remove_support_role')
          .setDescription('Remove a support role')
          .setRequired(false)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('delete')
      .setDescription('Delete a ticket system')
      .addStringOption(option =>
        option
          .setName('system')
          .setDescription('Ticket system to delete')
          .setRequired(true)
          .setAutocomplete(true)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('list')
      .setDescription('List all ticket systems')
  );

export const category = 'admin';
export const adminOnly = true;

export async function autocomplete(interaction: any) {
  if (!interaction.guild) return;

  const focusedOption = interaction.options.getFocused(true);
  
  if (focusedOption.name === 'system') {
    const systems = await prisma.ticketSystem.findMany({
      where: { guildId: interaction.guild.id },
      select: { id: true, name: true }
    });

    const choices = systems.map(system => ({
      name: system.name,
      value: system.id
    }));

    await interaction.respond(choices.slice(0, 25));
  }
}

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
    case 'create':
      await handleCreate(interaction, userLang);
      break;
    case 'panel':
      await handlePanel(interaction, userLang);
      break;
    case 'edit':
      await handleEdit(interaction, userLang);
      break;
    case 'delete':
      await handleDelete(interaction, userLang);
      break;
    case 'list':
      await handleList(interaction, userLang);
      break;
  }
}

async function handleCreate(interaction: ChatInputCommandInteraction, userLang: string) {
  const name = interaction.options.getString('name', true);
  const category = interaction.options.getChannel('category', true);
  const supportRole = interaction.options.getRole('support_role', true);
  const transcriptChannel = interaction.options.getChannel('transcript_channel');

  if (category.type !== ChannelType.GuildCategory) {
    await interaction.reply({
      content: 'Please select a category channel.',
      ephemeral: true
    });
    return;
  }

  const existingCount = await prisma.ticketSystem.count({
    where: { guildId: interaction.guild!.id }
  });

  if (existingCount >= 5) {
    await interaction.reply({
      content: 'You can only have up to 5 ticket systems per server.',
      ephemeral: true
    });
    return;
  }

  const ticketSystem = await prisma.ticketSystem.create({
    data: {
      guildId: interaction.guild!.id,
      name: name,
      categoryId: category.id,
      supportRoleIds: [supportRole.id],
      transcriptChannel: transcriptChannel?.id
    }
  });

  const embed = new EmbedBuilder()
    .setTitle('✅ Ticket System Created')
    .setDescription(`Successfully created ticket system **${name}**`)
    .setColor('#00ff00')
    .addFields(
      { name: 'Category', value: category.toString(), inline: true },
      { name: 'Support Role', value: supportRole.toString(), inline: true },
      { name: 'System ID', value: `\`${ticketSystem.id}\``, inline: true }
    );

  if (transcriptChannel) {
    embed.addFields({ 
      name: 'Transcript Channel', 
      value: transcriptChannel.toString(), 
      inline: true 
    });
  }

  await interaction.reply({ embeds: [embed] });
}

async function handlePanel(interaction: ChatInputCommandInteraction, userLang: string) {
  await interaction.deferReply({ ephemeral: true });

  const systemId = interaction.options.getString('system', true);
  const channel = interaction.options.getChannel('channel', true);
  const title = interaction.options.getString('title');
  const description = interaction.options.getString('description');
  const buttonLabel = interaction.options.getString('button_label');
  const buttonEmoji = interaction.options.getString('button_emoji');

  const ticketSystem = await prisma.ticketSystem.findUnique({
    where: { id: systemId }
  });

  if (!ticketSystem || ticketSystem.guildId !== interaction.guild!.id) {
    await interaction.editReply({
      content: 'Ticket system not found.'
    });
    return;
  }

  if (!channel || !('send' in channel)) {
    await interaction.editReply({
      content: 'Please select a valid text channel.'
    });
    return;
  }

  const updateData: any = {};
  if (title) updateData.panelTitle = title;
  if (description) updateData.panelDescription = description;
  if (buttonLabel) updateData.panelButtonLabel = buttonLabel;
  if (buttonEmoji) updateData.panelButtonEmoji = buttonEmoji;

  const embed = new EmbedBuilder()
    .setTitle(title || ticketSystem.panelTitle)
    .setDescription(description || ticketSystem.panelDescription)
    .setColor('#7289da')
    .setFooter({ text: ticketSystem.name });

  const button = new ButtonBuilder()
    .setCustomId(`ticket_create:${systemId}`)
    .setLabel(buttonLabel || ticketSystem.panelButtonLabel)
    .setEmoji(buttonEmoji || ticketSystem.panelButtonEmoji)
    .setStyle(ButtonStyle.Primary);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);

  try {
    const textChannel = channel as TextChannel;
    const message = await textChannel.send({ embeds: [embed], components: [row] });

    updateData.panelChannelId = channel.id;
    updateData.panelMessageId = message.id;

    await prisma.ticketSystem.update({
      where: { id: systemId },
      data: updateData
    });

    await interaction.editReply({
      content: '✅ Ticket panel created successfully!'
    });
  } catch (error) {
    await interaction.editReply({
      content: '❌ Failed to create ticket panel. Please check permissions.'
    });
  }
}

async function handleEdit(interaction: ChatInputCommandInteraction, userLang: string) {
  const systemId = interaction.options.getString('system', true);
  const welcomeMessage = interaction.options.getString('welcome_message');
  const maxTickets = interaction.options.getInteger('max_tickets');
  const addRole = interaction.options.getRole('add_support_role');
  const removeRole = interaction.options.getRole('remove_support_role');

  const ticketSystem = await prisma.ticketSystem.findUnique({
    where: { id: systemId }
  });

  if (!ticketSystem || ticketSystem.guildId !== interaction.guild!.id) {
    await interaction.reply({
      content: 'Ticket system not found.',
      ephemeral: true
    });
    return;
  }

  const updateData: any = {};
  
  if (welcomeMessage) updateData.welcomeMessage = welcomeMessage;
  if (maxTickets) updateData.maxTicketsPerUser = maxTickets;

  let supportRoles = [...ticketSystem.supportRoleIds];
  
  if (addRole && !supportRoles.includes(addRole.id)) {
    supportRoles.push(addRole.id);
    updateData.supportRoleIds = supportRoles;
  }
  
  if (removeRole && supportRoles.includes(removeRole.id)) {
    supportRoles = supportRoles.filter(id => id !== removeRole.id);
    updateData.supportRoleIds = supportRoles;
  }

  await prisma.ticketSystem.update({
    where: { id: systemId },
    data: updateData
  });

  const embed = new EmbedBuilder()
    .setTitle('✅ Ticket System Updated')
    .setDescription(`Updated ticket system **${ticketSystem.name}**`)
    .setColor('#00ff00')
    .setTimestamp();

  const changes: string[] = [];
  if (welcomeMessage) changes.push('• Welcome message updated');
  if (maxTickets) changes.push(`• Max tickets per user: ${maxTickets}`);
  if (addRole) changes.push(`• Added support role: ${addRole}`);
  if (removeRole) changes.push(`• Removed support role: ${removeRole}`);

  if (changes.length > 0) {
    embed.addFields({ name: 'Changes', value: changes.join('\n'), inline: false });
  }

  await interaction.reply({ embeds: [embed] });
}

async function handleDelete(interaction: ChatInputCommandInteraction, userLang: string) {
  const systemId = interaction.options.getString('system', true);

  const ticketSystem = await prisma.ticketSystem.findUnique({
    where: { id: systemId },
    include: {
      tickets: {
        where: { status: 'open' }
      }
    }
  });

  if (!ticketSystem || ticketSystem.guildId !== interaction.guild!.id) {
    await interaction.reply({
      content: 'Ticket system not found.',
      ephemeral: true
    });
    return;
  }

  if (ticketSystem.tickets.length > 0) {
    await interaction.reply({
      content: `Cannot delete ticket system **${ticketSystem.name}** because it has ${ticketSystem.tickets.length} open tickets.`,
      ephemeral: true
    });
    return;
  }

  const confirmEmbed = new EmbedBuilder()
    .setTitle('⚠️ Confirm Deletion')
    .setDescription(`Are you sure you want to delete the ticket system **${ticketSystem.name}**?\n\nThis action cannot be undone.`)
    .setColor('#ff0000');

  const confirmButton = new ButtonBuilder()
    .setCustomId('confirm_delete')
    .setLabel('Confirm')
    .setStyle(ButtonStyle.Danger);

  const cancelButton = new ButtonBuilder()
    .setCustomId('cancel_delete')
    .setLabel('Cancel')
    .setStyle(ButtonStyle.Secondary);

  const row = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(confirmButton, cancelButton);

  const response = await interaction.reply({
    embeds: [confirmEmbed],
    components: [row],
    ephemeral: true
  });

  try {
    const confirmation = await response.awaitMessageComponent({
      componentType: ComponentType.Button,
      time: 30000
    });

    if (confirmation.customId === 'confirm_delete') {
      await prisma.ticketSystem.delete({
        where: { id: systemId }
      });

      await confirmation.update({
        content: `✅ Ticket system **${ticketSystem.name}** has been deleted.`,
        embeds: [],
        components: []
      });
    } else {
      await confirmation.update({
        content: 'Deletion cancelled.',
        embeds: [],
        components: []
      });
    }
  } catch (error) {
    await interaction.editReply({
      content: 'Confirmation timed out.',
      embeds: [],
      components: []
    });
  }
}

async function handleList(interaction: ChatInputCommandInteraction, userLang: string) {
  const systems = await prisma.ticketSystem.findMany({
    where: { guildId: interaction.guild!.id },
    include: {
      _count: {
        select: { tickets: true }
      }
    }
  });

  if (systems.length === 0) {
    await interaction.reply({
      content: 'No ticket systems found in this server.',
      ephemeral: true
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle('📋 Ticket Systems')
    .setDescription(`Found ${systems.length} ticket system(s)`)
    .setColor('#7289da')
    .setTimestamp();

  for (const system of systems) {
    const category = interaction.guild!.channels.cache.get(system.categoryId);
    const supportRoles = system.supportRoleIds
      .map(id => interaction.guild!.roles.cache.get(id))
      .filter(role => role)
      .map(role => role!.toString())
      .join(', ');

    embed.addFields({
      name: system.name,
      value: [
        `**ID:** \`${system.id}\``,
        `**Category:** ${category || 'Unknown'}`,
        `**Support Roles:** ${supportRoles || 'None'}`,
        `**Max Tickets:** ${system.maxTicketsPerUser}`,
        `**Total Tickets:** ${system._count.tickets}`,
        `**Status:** ${system.enabled ? '✅ Enabled' : '❌ Disabled'}`
      ].join('\n'),
      inline: false
    });
  }

  await interaction.reply({ embeds: [embed], ephemeral: true });
}