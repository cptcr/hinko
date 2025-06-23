import { 
  SlashCommandBuilder, 
  ChatInputCommandInteraction, 
  EmbedBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  ActionRowBuilder, 
  ComponentType 
} from 'discord.js';
import { XPSystem } from '../../utils/xpSystem';
import { getUserLanguage, t } from '../../utils/i18n';

// Removed cronJobs import - we'll implement monthly reset directly

export const data = new SlashCommandBuilder()
  .setName('resetxp')
  .setDescription('Reset XP for users (Admin only)')
  .addSubcommand(subcommand =>
    subcommand
      .setName('user')
      .setDescription('Reset XP for a specific user')
      .addUserOption(option =>
        option
          .setName('target')
          .setDescription('User to reset XP for')
          .setRequired(true)
      )
      .addStringOption(option =>
        option
          .setName('type')
          .setDescription('Type of reset')
          .setRequired(true)
          .addChoices(
            { name: 'Current XP & Level', value: 'current' },
            { name: 'Monthly XP only', value: 'monthly' },
            { name: 'Total XP (everything)', value: 'total' }
          )
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('server')
      .setDescription('Reset XP for entire server')
      .addStringOption(option =>
        option
          .setName('type')
          .setDescription('Type of reset')
          .setRequired(true)
          .addChoices(
            { name: 'Current XP & Level', value: 'current' },
            { name: 'Monthly XP only', value: 'monthly' },
            { name: 'Total XP (everything)', value: 'total' }
          )
      )
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
  if (!memberPermissions || typeof memberPermissions === 'string' || !memberPermissions.has('Administrator')) {
    const userLang = await getUserLanguage(interaction.user.id, interaction.guild.id);
    await interaction.reply({
      content: t('commands.resetxp.no_permission', {}, userLang),
      ephemeral: true
    });
    return;
  }

  const subcommand = interaction.options.getSubcommand();
  const resetType = interaction.options.getString('type', true);
  const userLang = await getUserLanguage(interaction.user.id, interaction.guild.id);

  if (subcommand === 'user') {
    await handleUserReset(interaction, resetType, userLang);
  } else if (subcommand === 'server') {
    await handleServerReset(interaction, resetType, userLang);
  }
}

async function handleUserReset(
  interaction: ChatInputCommandInteraction,
  resetType: string,
  userLang: string
) {
  const targetUser = interaction.options.getUser('target', true);
  const targetMember = await interaction.guild!.members.fetch(targetUser.id).catch(() => null);

  if (!targetMember) {
    await interaction.reply({
      content: t('errors.user_not_found', {}, userLang),
      ephemeral: true
    });
    return;
  }

  // Create confirmation embed
  const embed = new EmbedBuilder()
    .setTitle(t('commands.resetxp.confirmation.title', {}, userLang))
    .setDescription(
      t('commands.resetxp.confirmation.user', {
        type: getResetTypeName(resetType, userLang),
        user: targetMember.toString()
      }, userLang) + '\n\n' +
      t('commands.resetxp.confirmation.warning', {}, userLang)
    )
    .setColor('#ff9900')
    .setTimestamp();

  // Create buttons
  const confirmButton = new ButtonBuilder()
    .setCustomId('confirm_reset')
    .setLabel(t('common.confirm', {}, userLang))
    .setStyle(ButtonStyle.Danger);

  const cancelButton = new ButtonBuilder()
    .setCustomId('cancel_reset')
    .setLabel(t('common.cancel', {}, userLang))
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

    if (confirmation.customId === 'confirm_reset') {
      await confirmation.deferUpdate();

      const success = await XPSystem.resetUserXP(
        targetUser.id,
        interaction.guild!.id,
        resetType === 'total'
      );

      if (resetType === 'monthly') {
        // For monthly reset, we need to reset only monthly XP
        await import('../../utils/database').then(db =>
          db.prisma.user.update({
            where: {
              id_guildId: {
                id: targetUser.id,
                guildId: interaction.guild!.id
              }
            },
            data: { monthlyXp: 0 }
          })
        );
      }

      if (success) {
        const successKey = `commands.resetxp.success.user_${resetType}`;
        await confirmation.editReply({
          content: t(successKey, { user: targetMember.displayName }, userLang),
          embeds: [],
          components: []
        });
      } else {
        await confirmation.editReply({
          content: t('commands.resetxp.error', {}, userLang),
          embeds: [],
          components: []
        });
      }
    } else {
      await confirmation.update({
        content: t('commands.resetxp.cancelled', {}, userLang),
        embeds: [],
        components: []
      });
    }
  } catch (error) {
    await interaction.editReply({
      content: t('commands.resetxp.cancelled', {}, userLang),
      embeds: [],
      components: []
    });
  }
}

async function handleServerReset(
  interaction: ChatInputCommandInteraction,
  resetType: string,
  userLang: string
) {
  // Get user count
  const userCount = await import('../../utils/database').then(db =>
    db.prisma.user.count({
      where: { guildId: interaction.guild!.id }
    })
  );

  // Create confirmation embed
  const embed = new EmbedBuilder()
    .setTitle(t('commands.resetxp.confirmation.title', {}, userLang))
    .setDescription(
      t('commands.resetxp.confirmation.guild', {
        type: getResetTypeName(resetType, userLang),
        count: userCount
      }, userLang) + '\n\n' +
      t('commands.resetxp.confirmation.warning', {}, userLang)
    )
    .setColor('#ff0000')
    .setTimestamp();

  // Create buttons
  const confirmButton = new ButtonBuilder()
    .setCustomId('confirm_guild_reset')
    .setLabel(t('common.confirm', {}, userLang))
    .setStyle(ButtonStyle.Danger);

  const cancelButton = new ButtonBuilder()
    .setCustomId('cancel_guild_reset')
    .setLabel(t('common.cancel', {}, userLang))
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

    if (confirmation.customId === 'confirm_guild_reset') {
      await confirmation.deferUpdate();

      let resetCount = 0;

      if (resetType === 'monthly') {
        // Manual monthly reset implementation
        const userCount = await import('../../utils/database').then(db =>
          db.prisma.user.count({
            where: { guildId: interaction.guild!.id }
          })
        );

        await import('../../utils/database').then(db =>
          db.prisma.$transaction([
            db.prisma.user.updateMany({
              where: { guildId: interaction.guild!.id },
              data: {
                monthlyXp: 0,
                lastReset: new Date()
              }
            }),
            db.prisma.monthlyReset.create({
              data: {
                guildId: interaction.guild!.id,
                userCount: userCount,
                resetDate: new Date()
              }
            })
          ])
        );

        resetCount = userCount;
      } else {
        resetCount = await XPSystem.resetGuildXP(
          interaction.guild!.id,
          resetType === 'monthly'
        );
      }

      const successKey = `commands.resetxp.success.guild_${resetType}`;
      await confirmation.editReply({
        content: t(successKey, { count: resetCount }, userLang),
        embeds: [],
        components: []
      });
    } else {
      await confirmation.update({
        content: t('commands.resetxp.cancelled', {}, userLang),
        embeds: [],
        components: []
      });
    }
  } catch (error) {
    await interaction.editReply({
      content: t('commands.resetxp.cancelled', {}, userLang),
      embeds: [],
      components: []
    });
  }
}

function getResetTypeName(resetType: string, userLang: string): string {
  switch (resetType) {
    case 'current':
      return 'Current XP & Level';
    case 'monthly':
      return 'Monthly XP';
    case 'total':
      return 'Total XP';
    default:
      return resetType;
  }
}