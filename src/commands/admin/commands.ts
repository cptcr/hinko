import { 
  SlashCommandBuilder, 
  ChatInputCommandInteraction, 
  EmbedBuilder,
  PermissionFlagsBits,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ComponentType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ModalSubmitInteraction
} from 'discord.js';
import { prisma } from '../../utils/database';
import { getUserLanguage, t } from '../../utils/i18n';

export const data = new SlashCommandBuilder()
  .setName('commands')
  .setDescription('Manage custom guild commands')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand(subcommand =>
    subcommand
      .setName('create')
      .setDescription('Create a new custom command')
      .addStringOption(option =>
        option
          .setName('name')
          .setDescription('Command name (without slash)')
          .setRequired(true)
          .setMaxLength(32)
      )
      .addStringOption(option =>
        option
          .setName('description')
          .setDescription('Command description')
          .setRequired(true)
          .setMaxLength(100)
      )
      .addStringOption(option =>
        option
          .setName('type')
          .setDescription('Response type')
          .setRequired(true)
          .addChoices(
            { name: 'Text Message', value: 'text' },
            { name: 'Embed', value: 'embed' },
            { name: 'Advanced (Modal)', value: 'advanced' }
          )
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('edit')
      .setDescription('Edit an existing custom command')
      .addStringOption(option =>
        option
          .setName('command')
          .setDescription('Command to edit')
          .setRequired(true)
          .setAutocomplete(true)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('delete')
      .setDescription('Delete a custom command')
      .addStringOption(option =>
        option
          .setName('command')
          .setDescription('Command to delete')
          .setRequired(true)
          .setAutocomplete(true)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('list')
      .setDescription('List all custom commands')
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('stats')
      .setDescription('View custom command usage statistics')
      .addStringOption(option =>
        option
          .setName('command')
          .setDescription('Specific command stats')
          .setRequired(false)
          .setAutocomplete(true)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('toggle')
      .setDescription('Enable/disable a custom command')
      .addStringOption(option =>
        option
          .setName('command')
          .setDescription('Command to toggle')
          .setRequired(true)
          .setAutocomplete(true)
      )
      .addBooleanOption(option =>
        option
          .setName('enabled')
          .setDescription('Enable or disable the command')
          .setRequired(true)
      )
  );

export const category = 'admin';
export const adminOnly = true;

export async function autocomplete(interaction: any) {
  if (!interaction.guild) return;

  const focusedOption = interaction.options.getFocused(true);
  
  if (focusedOption.name === 'command') {
    const commands = await prisma.customCommand.findMany({
      where: { guildId: interaction.guild.id },
      select: { name: true, description: true }
    });

    const choices = commands.map(cmd => ({
      name: `${cmd.name} - ${cmd.description}`,
      value: cmd.name
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
    case 'edit':
      await handleEdit(interaction, userLang);
      break;
    case 'delete':
      await handleDelete(interaction, userLang);
      break;
    case 'list':
      await handleList(interaction, userLang);
      break;
    case 'stats':
      await handleStats(interaction, userLang);
      break;
    case 'toggle':
      await handleToggle(interaction, userLang);
      break;
  }
}

async function handleCreate(interaction: ChatInputCommandInteraction, userLang: string) {
  const name = interaction.options.getString('name', true).toLowerCase();
  const description = interaction.options.getString('description', true);
  const type = interaction.options.getString('type', true);

  if (!/^[a-z0-9_-]{1,32}$/.test(name)) {
    await interaction.reply({
      content: 'Command name can only contain lowercase letters, numbers, underscores, and hyphens.',
      ephemeral: true
    });
    return;
  }

  const reservedNames = ['help', 'ping', 'info', 'commands', 'giveaway', 'community', 'ticket', 'poll'];
  if (reservedNames.includes(name)) {
    await interaction.reply({
      content: 'This command name is reserved and cannot be used.',
      ephemeral: true
    });
    return;
  }

  const existing = await prisma.customCommand.findUnique({
    where: {
      guildId_name: {
        guildId: interaction.guild!.id,
        name: name
      }
    }
  });

  if (existing) {
    await interaction.reply({
      content: `Command \`${name}\` already exists. Use \`/commands edit\` to modify it.`,
      ephemeral: true
    });
    return;
  }

  if (type === 'advanced') {
    await showAdvancedModal(interaction, 'create', name, description);
  } else {
    await showBasicModal(interaction, 'create', name, description, type);
  }
}

async function showBasicModal(
  interaction: ChatInputCommandInteraction, 
  action: string, 
  name: string, 
  description: string, 
  type: string
) {
  const modal = new ModalBuilder()
    .setCustomId(`custom_command_${action}:${name}:${type}`)
    .setTitle(`${action === 'create' ? 'Create' : 'Edit'} Custom Command`);

  const contentInput = new TextInputBuilder()
    .setCustomId('content')
    .setLabel(type === 'embed' ? 'Embed Title' : 'Message Content')
    .setStyle(type === 'embed' ? TextInputStyle.Short : TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(type === 'embed' ? 256 : 2000);

  if (type === 'embed') {
    const descInput = new TextInputBuilder()
      .setCustomId('description')
      .setLabel('Embed Description')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(false)
      .setMaxLength(4096);

    const colorInput = new TextInputBuilder()
      .setCustomId('color')
      .setLabel('Embed Color (hex color, e.g., #7289da)')
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setMaxLength(7)
      .setValue('#7289da');

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(contentInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(descInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(colorInput)
    );
  } else {
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(contentInput)
    );
  }

  await interaction.showModal(modal);
}

async function showAdvancedModal(
  interaction: ChatInputCommandInteraction, 
  action: string, 
  name: string, 
  description: string
) {
  const modal = new ModalBuilder()
    .setCustomId(`custom_command_${action}:${name}:advanced`)
    .setTitle(`${action === 'create' ? 'Create' : 'Edit'} Advanced Command`);

  const titleInput = new TextInputBuilder()
    .setCustomId('title')
    .setLabel('Embed Title')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(256);

  const descInput = new TextInputBuilder()
    .setCustomId('description')
    .setLabel('Embed Description')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setMaxLength(4096);

  const colorInput = new TextInputBuilder()
    .setCustomId('color')
    .setLabel('Embed Color (hex)')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(7)
    .setValue('#7289da');

  const imageInput = new TextInputBuilder()
    .setCustomId('image')
    .setLabel('Image URL (optional)')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(500);

  const footerInput = new TextInputBuilder()
    .setCustomId('footer')
    .setLabel('Footer Text (optional)')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(2048);

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(titleInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(descInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(colorInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(imageInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(footerInput)
  );

  await interaction.showModal(modal);
}

export async function handleCustomCommandModal(interaction: ModalSubmitInteraction) {
  if (!interaction.guild) return;

  const [actionType, name, type] = interaction.customId.split(':');
  const action = actionType.replace('custom_command_', '');

  const commandData: any = {
    name: name,
    type: type,
    enabled: true
  };

  if (type === 'text') {
    commandData.content = interaction.fields.getTextInputValue('content');
  } else if (type === 'embed') {
    commandData.embedTitle = interaction.fields.getTextInputValue('content');
    commandData.embedDescription = interaction.fields.getTextInputValue('description') || null;
    commandData.embedColor = interaction.fields.getTextInputValue('color') || '#7289da';
  } else if (type === 'advanced') {
    commandData.embedTitle = interaction.fields.getTextInputValue('title');
    commandData.embedDescription = interaction.fields.getTextInputValue('description') || null;
    commandData.embedColor = interaction.fields.getTextInputValue('color') || '#7289da';
    commandData.embedImage = interaction.fields.getTextInputValue('image') || null;
    commandData.embedFooter = interaction.fields.getTextInputValue('footer') || null;
  }

  try {
    if (action === 'create') {
      await prisma.customCommand.create({
        data: {
          guildId: interaction.guild.id,
          ...commandData,
          createdBy: interaction.user.id
        }
      });

      await interaction.reply({
        content: `✅ Custom command \`/${name}\` created successfully!`,
        ephemeral: true
      });
    } else if (action === 'edit') {
      await prisma.customCommand.update({
        where: {
          guildId_name: {
            guildId: interaction.guild.id,
            name: name
          }
        },
        data: commandData
      });

      await interaction.reply({
        content: `✅ Custom command \`/${name}\` updated successfully!`,
        ephemeral: true
      });
    }
  } catch (error) {
    console.error('Error handling custom command modal:', error);
    await interaction.reply({
      content: '❌ An error occurred while processing the command.',
      ephemeral: true
    });
  }
}

async function handleEdit(interaction: ChatInputCommandInteraction, userLang: string) {
  const commandName = interaction.options.getString('command', true);

  const command = await prisma.customCommand.findUnique({
    where: {
      guildId_name: {
        guildId: interaction.guild!.id,
        name: commandName
      }
    }
  });

  if (!command) {
    await interaction.reply({
      content: `Command \`${commandName}\` not found.`,
      ephemeral: true
    });
    return;
  }

  if (command.type === 'advanced') {
    await showAdvancedModal(interaction, 'edit', command.name, '');
  } else {
    await showBasicModal(interaction, 'edit', command.name, '', command.type);
  }
}

async function handleDelete(interaction: ChatInputCommandInteraction, userLang: string) {
  const commandName = interaction.options.getString('command', true);

  const command = await prisma.customCommand.findUnique({
    where: {
      guildId_name: {
        guildId: interaction.guild!.id,
        name: commandName
      }
    }
  });

  if (!command) {
    await interaction.reply({
      content: `Command \`${commandName}\` not found.`,
      ephemeral: true
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle('⚠️ Confirm Deletion')
    .setDescription(`Are you sure you want to delete the custom command \`/${commandName}\`?\n\nThis action cannot be undone.`)
    .setColor('#ff0000');

  const confirmButton = new ButtonBuilder()
    .setCustomId(`delete_custom_cmd:${commandName}`)
    .setLabel('Delete')
    .setStyle(ButtonStyle.Danger);

  const cancelButton = new ButtonBuilder()
    .setCustomId('cancel_delete')
    .setLabel('Cancel')
    .setStyle(ButtonStyle.Secondary);

  const row = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(confirmButton, cancelButton);

  const response = await interaction.reply({
    embeds: [embed],
    components: [row],
    ephemeral: true
  });

  try {
    const confirmation = await response.awaitMessageComponent({
      componentType: ComponentType.Button,
      time: 30000
    });

    if (confirmation.customId === `delete_custom_cmd:${commandName}`) {
      await prisma.customCommand.delete({
        where: {
          guildId_name: {
            guildId: interaction.guild!.id,
            name: commandName
          }
        }
      });

      await confirmation.update({
        content: `✅ Custom command \`/${commandName}\` has been deleted.`,
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
  const commands = await prisma.customCommand.findMany({
    where: { guildId: interaction.guild!.id },
    orderBy: { name: 'asc' },
    include: {
      _count: {
        select: { usage: true }
      }
    }
  });

  if (commands.length === 0) {
    await interaction.reply({
      content: 'No custom commands found. Use `/commands create` to create one!',
      ephemeral: true
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle('📋 Custom Commands')
    .setDescription(`Found ${commands.length} custom command(s)`)
    .setColor('#7289da')
    .setTimestamp();

  for (const command of commands) {
    const status = command.enabled ? '✅ Enabled' : '❌ Disabled';
    const usage = command._count.usage;
    
    embed.addFields({
      name: `/${command.name}`,
      value: [
        `**Type:** ${command.type}`,
        `**Status:** ${status}`,
        `**Usage:** ${usage} times`,
        `**Created:** <t:${Math.floor(command.createdAt.getTime() / 1000)}:R>`
      ].join('\n'),
      inline: true
    });
  }

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleStats(interaction: ChatInputCommandInteraction, userLang: string) {
  const commandName = interaction.options.getString('command');

  if (commandName) {
    const command = await prisma.customCommand.findUnique({
      where: {
        guildId_name: {
          guildId: interaction.guild!.id,
          name: commandName
        }
      },
      include: {
        usage: {
          orderBy: { usedAt: 'desc' },
          take: 10,
          include: {
            user: true
          }
        },
        _count: {
          select: { usage: true }
        }
      }
    });

    if (!command) {
      await interaction.reply({
        content: `Command \`${commandName}\` not found.`,
        ephemeral: true
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle(`📊 Stats for /${commandName}`)
      .setColor('#7289da')
      .addFields(
        { name: 'Total Uses', value: command._count.usage.toString(), inline: true },
        { name: 'Status', value: command.enabled ? '✅ Enabled' : '❌ Disabled', inline: true },
        { name: 'Type', value: command.type, inline: true }
      );

    if (command.usage.length > 0) {
      const recentUsage = command.usage
        .slice(0, 5)
        .map(u => `<@${u.userId}> - <t:${Math.floor(u.usedAt.getTime() / 1000)}:R>`)
        .join('\n');

      embed.addFields({
        name: 'Recent Usage',
        value: recentUsage,
        inline: false
      });
    }

    await interaction.reply({ embeds: [embed], ephemeral: true });
  } else {
    const totalCommands = await prisma.customCommand.count({
      where: { guildId: interaction.guild!.id }
    });

    const totalUsage = await prisma.customCommandUsage.count({
      where: { 
        command: { guildId: interaction.guild!.id }
      }
    });

    const topCommands = await prisma.customCommand.findMany({
      where: { guildId: interaction.guild!.id },
      include: {
        _count: {
          select: { usage: true }
        }
      },
      orderBy: {
        usage: {
          _count: 'desc'
        }
      },
      take: 5
    });

    const embed = new EmbedBuilder()
      .setTitle('📊 Custom Commands Statistics')
      .setColor('#7289da')
      .addFields(
        { name: 'Total Commands', value: totalCommands.toString(), inline: true },
        { name: 'Total Usage', value: totalUsage.toString(), inline: true }
      );

    if (topCommands.length > 0) {
      const topCommandsText = topCommands
        .map((cmd, index) => `${index + 1}. \`/${cmd.name}\` - ${cmd._count.usage} uses`)
        .join('\n');

      embed.addFields({
        name: 'Most Used Commands',
        value: topCommandsText,
        inline: false
      });
    }

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
}

async function handleToggle(interaction: ChatInputCommandInteraction, userLang: string) {
  const commandName = interaction.options.getString('command', true);
  const enabled = interaction.options.getBoolean('enabled', true);

  const command = await prisma.customCommand.findUnique({
    where: {
      guildId_name: {
        guildId: interaction.guild!.id,
        name: commandName
      }
    }
  });

  if (!command) {
    await interaction.reply({
      content: `Command \`${commandName}\` not found.`,
      ephemeral: true
    });
    return;
  }

  await prisma.customCommand.update({
    where: {
      guildId_name: {
        guildId: interaction.guild!.id,
        name: commandName
      }
    },
    data: { enabled: enabled }
  });

  await interaction.reply({
    content: `✅ Command \`/${commandName}\` has been ${enabled ? 'enabled' : 'disabled'}.`,
    ephemeral: true
  });
}