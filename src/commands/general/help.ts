import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { ExtendedClient } from '../../types';
import { getCommandsByCategory, hasPermission, isAdminCommand } from '../../utils/commandLoader';
import { getUserLanguage, t } from '../../utils/i18n';

export const data = new SlashCommandBuilder()
  .setName('help')
  .setDescription('Show help information about commands')
  .addStringOption(option =>
    option
      .setName('command')
      .setDescription('Get detailed information about a specific command')
      .setRequired(false)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const client = interaction.client as ExtendedClient;
  const userLang = await getUserLanguage(interaction.user.id, interaction.guild!.id);
  const commandName = interaction.options.getString('command');

  if (commandName) {
    // Show detailed info for specific command
    await showCommandDetail(interaction, client, commandName, userLang);
  } else {
    // Show general help with all commands
    await showGeneralHelp(interaction, client, userLang);
  }
}

async function showGeneralHelp(
  interaction: ChatInputCommandInteraction,
  client: ExtendedClient,
  userLang: string
) {
  const categories = getCommandsByCategory(client);
  const embed = new EmbedBuilder()
    .setTitle(t('commands.help.embed.title', {}, userLang))
    .setDescription(t('commands.help.embed.description', {}, userLang))
    .setColor('#7289da')
    .setThumbnail(client.user?.displayAvatarURL() || null)
    .setFooter({ text: t('commands.help.embed.footer', {}, userLang) })
    .setTimestamp();

  // Get user permissions for filtering
  const memberPermissions = interaction.member?.permissions;
  const isAdmin = memberPermissions && typeof memberPermissions !== 'string' && 
    (memberPermissions.has('Administrator') || memberPermissions.has('ManageGuild'));

  categories.forEach((commands, categoryName) => {
    const categoryDisplayName = t(`commands.help.categories.${categoryName}`, {}, userLang);
    let commandList = '';

    commands.forEach(command => {
      // Filter admin commands for non-admins
      if (isAdminCommand(command) && !isAdmin) {
        return;
      }

      // Filter commands based on permissions
      if (command.permissions && memberPermissions && typeof memberPermissions !== 'string' && !hasPermission(command, memberPermissions)) {
        return;
      }

      const commandDescription = command.data.description || 'No description';
      commandList += `\`/${command.data.name}\` - ${commandDescription}\n`;
    });

    if (commandList) {
      embed.addFields({
        name: categoryDisplayName,
        value: commandList,
        inline: false
      });
    }
  });

  await interaction.reply({ embeds: [embed] });
}

async function showCommandDetail(
  interaction: ChatInputCommandInteraction,
  client: ExtendedClient,
  commandName: string,
  userLang: string
) {
  const command = client.commands.get(commandName);

  if (!command) {
    await interaction.reply({
      content: t('commands.help.command_not_found', { command: commandName }, userLang),
      ephemeral: true
    });
    return;
  }

  // Check if user can see this command
  const memberPermissions = interaction.member?.permissions;
  const isAdmin = memberPermissions && typeof memberPermissions !== 'string' && 
    (memberPermissions.has('Administrator') || memberPermissions.has('ManageGuild'));

  if (isAdminCommand(command) && !isAdmin) {
    await interaction.reply({
      content: t('commands.help.command_not_found', { command: commandName }, userLang),
      ephemeral: true
    });
    return;
  }

  if (command.permissions && memberPermissions && typeof memberPermissions !== 'string' && !hasPermission(command, memberPermissions)) {
    await interaction.reply({
      content: t('commands.help.command_not_found', { command: commandName }, userLang),
      ephemeral: true
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle(t('commands.help.command_detail.title', { command: commandName }, userLang))
    .setDescription(t('commands.help.command_detail.description', { 
      description: command.data.description 
    }, userLang))
    .setColor('#7289da')
    .setTimestamp();

  // Add usage information
  embed.addFields({
    name: 'Usage',
    value: t('commands.help.command_detail.usage', { 
      usage: `/${commandName}${getCommandUsage(command.data)}` 
    }, userLang),
    inline: false
  });

  // Add category
  if (command.category) {
    embed.addFields({
      name: 'Category',
      value: t('commands.help.command_detail.category', { 
        category: t(`commands.help.categories.${command.category}`, {}, userLang)
      }, userLang),
      inline: true
    });
  }

  // Add permissions if any
  if (command.permissions && command.permissions.length > 0) {
    const permissionNames = command.permissions.map(perm => 
      typeof perm === 'string' ? perm : perm.toString()
    ).join(', ');

    embed.addFields({
      name: 'Required Permissions',
      value: t('commands.help.command_detail.permissions', { 
        permissions: permissionNames 
      }, userLang),
      inline: true
    });
  }

  // Add admin only flag
  if (isAdminCommand(command)) {
    embed.addFields({
      name: 'Admin Only',
      value: t('commands.help.command_detail.admin_only', {}, userLang),
      inline: true
    });
  }

  await interaction.reply({ embeds: [embed] });
}

function getCommandUsage(commandData: any): string {
  let usage = '';
  
  if (commandData.options && commandData.options.length > 0) {
    commandData.options.forEach((option: any) => {
      if (option.required) {
        usage += ` <${option.name}>`;
      } else {
        usage += ` [${option.name}]`;
      }
    });
  }
  
  return usage;
}