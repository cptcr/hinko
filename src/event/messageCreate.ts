import { Events, Message, EmbedBuilder } from 'discord.js';
import { XPSystem } from '../utils/xpSystem';
import { XPGainReason } from '../types';
import { ensureGuild, ensureUser, prisma } from '../utils/database';
import { getUserLanguage, t } from '../utils/i18n';

export const name = Events.MessageCreate;

export async function execute(message: Message) {
  // Ignore bots and DMs
  if (message.author.bot || !message.guild) return;

  // Check if this is a ticket channel and log the message
  await logTicketMessage(message);

  // Ignore empty messages or commands
  if (!message.content || message.content.startsWith('/')) return;

  // Ignore messages that are too short (spam protection)
  if (message.content.length < 3) return;

  try {
    // Ensure guild and user exist in database
    await ensureGuild(message.guild.id);
    await ensureUser(message.author.id, message.guild.id, message.author.username);

    // Try to gain XP
    const result = await XPSystem.gainXP(
      message.author.id,
      message.guild.id,
      message.author.username,
      XPGainReason.MESSAGE
    );

    if (!result) return; // No XP gained (cooldown, frozen, or disabled)

    // Check for level up
    if (result.levelUp && result.newLevel !== undefined) {
      await handleLevelUp(message, result.newLevel);
    }

  } catch (error) {
    console.error('Error processing message for XP:', error);
  }
}

async function handleLevelUp(message: Message, newLevel: number) {
  if (!message.guild || !message.member) return;

  try {
    // Get user language
    const userLang = await getUserLanguage(message.author.id, message.guild.id);

    // Check for level roles
    const addedRoles = await XPSystem.checkLevelRoles(
      message.member,
      newLevel - 1,
      newLevel
    );

    // Create level up embed
    const embed = new EmbedBuilder()
      .setTitle(t('events.level_up.title', {}, userLang))
      .setDescription(
        t('events.level_up.description', {
          user: message.author.toString(),
          level: newLevel
        }, userLang) +
        (addedRoles.length > 0 
          ? t('events.level_up.roles_added', {
              roles: addedRoles.join(', ')
            }, userLang)
          : ''
        )
      )
      .setColor('#00ff00')
      .setThumbnail(message.author.displayAvatarURL({ size: 128 }))
      .setTimestamp();

    // Send level up message
    if (message.channel && 'send' in message.channel && typeof message.channel.send === 'function') {
      await message.channel.send({ embeds: [embed] });
    }

    console.log(`🎉 ${message.author.username} leveled up to ${newLevel} in ${message.guild.name}`);

  } catch (error) {
    console.error('Error handling level up:', error);
  }
}

async function logTicketMessage(message: Message) {
  if (!message.guild || !message.channel) return;

  try {
    // Check if this channel is a ticket
    const ticket = await prisma.ticket.findFirst({
      where: {
        channelId: message.channel.id,
        guildId: message.guild.id,
        status: 'open'
      }
    });

    if (!ticket) return;

    // Log the message
    await prisma.ticketMessage.create({
      data: {
        ticketId: ticket.id,
        userId: message.author.id,
        guildId: message.guild.id,
        content: message.content.substring(0, 1000) // Limit to 1000 chars
      }
    });
  } catch (error) {
    console.error('Error logging ticket message:', error);
  }
}