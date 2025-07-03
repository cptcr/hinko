import { Events, Interaction, EmbedBuilder } from 'discord.js';
import { ExtendedClient } from '../types';
import { hasPermission, isAdminCommand } from '../utils/commandLoader';
import { ensureGuild } from '../utils/database';
import { getUserLanguage, t } from '../utils/i18n';
import { handleTicketButton, handleTicketModal } from '../interactions/ticketButtons';
import { handlePollButton } from '../interactions/pollButtons';

export const name = Events.InteractionCreate;

export async function execute(interaction: Interaction) {
  if (interaction.isButton()) {
    const customId = interaction.customId;
    
    if (customId.startsWith('ticket_')) {
      await handleTicketButton(interaction);
      return;
    }
    
    if (customId.startsWith('poll_')) {
      await handlePollButton(interaction);
      return;
    }
  }
  
  if (interaction.isModalSubmit()) {
    const customId = interaction.customId;
    
    if (customId.startsWith('ticket_')) {
      await handleTicketModal(interaction);
      return;
    }
  }
  
  if (interaction.isAutocomplete()) {
    const client = interaction.client as ExtendedClient;
    const command = client.commands.get(interaction.commandName);
    
    if (command && 'autocomplete' in command && typeof command.autocomplete === 'function') {
      try {
        await command.autocomplete(interaction);
      } catch (error) {
        console.error(`Error in autocomplete for ${interaction.commandName}:`, error);
      }
    }
    return;
  }

  if (!interaction.isChatInputCommand() || !interaction.guild) return;

  const client = interaction.client as ExtendedClient;
  const command = client.commands.get(interaction.commandName);

  if (!command) {
    console.warn(`No command matching ${interaction.commandName} was found.`);
    return;
  }

  try {
    // Ensure guild exists in database
    await ensureGuild(interaction.guild.id);

    // Get user language for error messages
    const userLang = await getUserLanguage(interaction.user.id, interaction.guild.id);

    // Check if command is admin only
    if (isAdminCommand(command)) {
      const memberPermissions = interaction.member?.permissions;
      if (!memberPermissions || typeof memberPermissions === 'string') {
        await interaction.reply({
          content: t('errors.permission', {}, userLang),
          ephemeral: true
        });
        return;
      }

      if (!memberPermissions.has('Administrator') && !memberPermissions.has('ManageGuild')) {
        await interaction.reply({
          content: t('errors.permission', {}, userLang),
          ephemeral: true
        });
        return;
      }
    }

    // Check permissions
    if (command.permissions && interaction.member?.permissions) {
      const memberPermissions = interaction.member.permissions;
      
      if (typeof memberPermissions !== 'string' && !hasPermission(command, memberPermissions)) {
        const permissionNames = command.permissions.map(perm => 
          typeof perm === 'string' ? perm : perm.toString()
        ).join(', ');

        await interaction.reply({
          content: t('commands.help.command_detail.permissions', {
            permissions: permissionNames
          }, userLang),
          ephemeral: true
        });
        return;
      }
    }

    // Check bot permissions
    if (!interaction.guild.members.me) {
      await interaction.reply({
        content: t('errors.bot_missing_permissions', {}, userLang),
        ephemeral: true
      });
      return;
    }

    // Execute command
    await command.execute(interaction);

    // Log command usage
    console.log(
      `📝 ${interaction.user.username} used /${interaction.commandName} in ${interaction.guild.name}`
    );

  } catch (error) {
    console.error(`Error executing command ${interaction.commandName}:`, error);

    const userLang = await getUserLanguage(interaction.user.id, interaction.guild.id).catch(() => 'en');
    const errorEmbed = new EmbedBuilder()
      .setTitle('❌ Error')
      .setDescription(t('errors.generic', {}, userLang))
      .setColor('#ff0000')
      .setTimestamp();

    const errorResponse = { embeds: [errorEmbed], ephemeral: true };

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(errorResponse);
    } else {
      await interaction.reply(errorResponse);
    }
  }
}