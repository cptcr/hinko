import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { XPSystem } from '../../utils/xpSystem';
import { ensureUser } from '../../utils/database';
import { getUserLanguage, t } from '../../utils/i18n';

export const data = new SlashCommandBuilder()
  .setName('freezexp')
  .setDescription('Freeze/unfreeze users from gaining XP (Admin only)')
  .addUserOption(option =>
    option
      .setName('user')
      .setDescription('User to freeze/unfreeze')
      .setRequired(true)
  )
  .addStringOption(option =>
    option
      .setName('action')
      .setDescription('Action to perform')
      .setRequired(true)
      .addChoices(
        { name: 'Freeze', value: 'freeze' },
        { name: 'Unfreeze', value: 'unfreeze' }
      )
  )
  .addStringOption(option =>
    option
      .setName('duration')
      .setDescription('Duration to freeze (e.g., 1h, 30m, 2d) - leave empty for permanent')
      .setRequired(false)
  )
  .addStringOption(option =>
    option
      .setName('reason')
      .setDescription('Reason for freezing')
      .setRequired(false)
  );

export const adminOnly = true;

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) {
    await interaction.reply({
      content: 'This command can only be used in a server.',
      ephemeral: true
    });
    return;
  }

  // Check permissions
  const memberPermissions = interaction.member?.permissions;
  if (!memberPermissions || typeof memberPermissions === 'string' || 
      (!memberPermissions.has('Administrator') && !memberPermissions.has('ManageGuild'))) {
    const userLang = await getUserLanguage(interaction.user.id, interaction.guild.id);
    await interaction.reply({
      content: t('commands.freezexp.no_permission', {}, userLang),
      ephemeral: true
    });
    return;
  }

  const targetUser = interaction.options.getUser('user', true);
  const action = interaction.options.getString('action', true);
  const durationStr = interaction.options.getString('duration');
  const reason = interaction.options.getString('reason');
  const userLang = await getUserLanguage(interaction.user.id, interaction.guild.id);

  // Ensure target user exists in database
  await ensureUser(targetUser.id, interaction.guild.id, targetUser.username);

  // Get target member
  const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
  if (!targetMember) {
    await interaction.reply({
      content: t('errors.user_not_found', {}, userLang),
      ephemeral: true
    });
    return;
  }

  // Prevent freezing admins (unless you're the owner)
  if (targetMember.permissions.has('Administrator') && interaction.guild.ownerId !== interaction.user.id) {
    await interaction.reply({
      content: 'Cannot freeze administrators.',
      ephemeral: true
    });
    return;
  }

  try {
    if (action === 'freeze') {
      await handleFreeze(interaction, targetUser, targetMember, durationStr, reason, userLang);
    } else {
      await handleUnfreeze(interaction, targetUser, targetMember, userLang);
    }
  } catch (error) {
    console.error('Error executing freezexp command:', error);
    await interaction.reply({
      content: t('commands.freezexp.error', { action }, userLang),
      ephemeral: true
    });
  }
}

async function handleFreeze(
  interaction: ChatInputCommandInteraction,
  targetUser: any,
  targetMember: any,
  durationStr: string | null,
  reason: string | null,
  userLang: string
) {
  // Check if user is already frozen
  const currentUser = await import('../../utils/database').then(db =>
    db.prisma.user.findUnique({
      where: {
        id_guildId: {
          id: targetUser.id,
          guildId: interaction.guild!.id
        }
      }
    })
  );

  if (currentUser?.frozen) {
    await interaction.reply({
      content: t('commands.freezexp.already_frozen', { user: targetMember.displayName }, userLang),
      ephemeral: true
    });
    return;
  }

  // Parse duration
  let durationMs: number | undefined;
  let durationText = '';

  if (durationStr) {
    const parsedDuration = parseDuration(durationStr);
    if (parsedDuration === null) {
      await interaction.reply({
        content: t('commands.freezexp.invalid_duration', {}, userLang),
        ephemeral: true
      });
      return;
    }
    durationMs = parsedDuration;
    durationText = t('commands.freezexp.success.freeze_duration', { 
      duration: formatDuration(durationMs, userLang) 
    }, userLang);
  } else {
    durationText = t('commands.freezexp.success.freeze_permanent', {}, userLang);
  }

  // Freeze the user
  const success = await XPSystem.freezeUser(
    targetUser.id,
    interaction.guild!.id,
    interaction.user.id,
    durationMs
  );

  if (success) {
    const reasonText = reason 
      ? t('commands.freezexp.success.freeze_reason', { reason }, userLang)
      : '';

    await interaction.reply({
      content: t('commands.freezexp.success.freeze', {
        user: targetMember.displayName,
        duration: durationText,
        reason: reasonText
      }, userLang),
      ephemeral: true
    });

    // Log the action
    console.log(`❄️ ${interaction.user.username} froze ${targetUser.username} in ${interaction.guild!.name}${durationStr ? ` for ${durationStr}` : ' permanently'}${reason ? ` (${reason})` : ''}`);
  } else {
    await interaction.reply({
      content: t('commands.freezexp.error', { action: 'freeze' }, userLang),
      ephemeral: true
    });
  }
}

async function handleUnfreeze(
  interaction: ChatInputCommandInteraction,
  targetUser: any,
  targetMember: any,
  userLang: string
) {
  // Check if user is frozen
  const currentUser = await import('../../utils/database').then(db =>
    db.prisma.user.findUnique({
      where: {
        id_guildId: {
          id: targetUser.id,
          guildId: interaction.guild!.id
        }
      }
    })
  );

  if (!currentUser?.frozen) {
    await interaction.reply({
      content: t('commands.freezexp.not_frozen', { user: targetMember.displayName }, userLang),
      ephemeral: true
    });
    return;
  }

  // Unfreeze the user
  const success = await XPSystem.unfreezeUser(targetUser.id, interaction.guild!.id);

  if (success) {
    await interaction.reply({
      content: t('commands.freezexp.success.unfreeze', { 
        user: targetMember.displayName 
      }, userLang),
      ephemeral: true
    });

    // Log the action
    console.log(`✅ ${interaction.user.username} unfroze ${targetUser.username} in ${interaction.guild!.name}`);
  } else {
    await interaction.reply({
      content: t('commands.freezexp.error', { action: 'unfreeze' }, userLang),
      ephemeral: true
    });
  }
}

function parseDuration(durationStr: string): number | null {
  const regex = /^(\d+)([smhd])$/i;
  const match = durationStr.toLowerCase().match(regex);
  
  if (!match) return null;
  
  const value = parseInt(match[1]);
  const unit = match[2];
  
  switch (unit) {
    case 's':
      return value * 1000;
    case 'm':
      return value * 60 * 1000;
    case 'h':
      return value * 60 * 60 * 1000;
    case 'd':
      return value * 24 * 60 * 60 * 1000;
    default:
      return null;
  }
}

function formatDuration(ms: number, userLang: string): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) {
    return days === 1 
      ? t('common.time.days', { count: days }, userLang)
      : t('common.time.days_plural', { count: days }, userLang);
  } else if (hours > 0) {
    return hours === 1
      ? t('common.time.hours', { count: hours }, userLang)
      : t('common.time.hours_plural', { count: hours }, userLang);
  } else if (minutes > 0) {
    return minutes === 1
      ? t('common.time.minutes', { count: minutes }, userLang)
      : t('common.time.minutes_plural', { count: minutes }, userLang);
  } else {
    return seconds === 1
      ? t('common.time.seconds', { count: seconds }, userLang)
      : t('common.time.seconds_plural', { count: seconds }, userLang);
  }
}