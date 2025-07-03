import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, PermissionFlagsBits, Role } from 'discord.js';
import { prisma } from '../../utils/database';
import { getUserLanguage, t } from '../../utils/i18n';

export const data = new SlashCommandBuilder()
  .setName('quarantine')
  .setDescription('Quarantine a user (removes all roles and permissions)')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
  .addSubcommand(subcommand =>
    subcommand
      .setName('add')
      .setDescription('Put a user in quarantine')
      .addUserOption(option =>
        option
          .setName('user')
          .setDescription('User to quarantine')
          .setRequired(true)
      )
      .addStringOption(option =>
        option
          .setName('reason')
          .setDescription('Reason for quarantine')
          .setRequired(true)
      )
      .addRoleOption(option =>
        option
          .setName('role')
          .setDescription('Quarantine role to assign')
          .setRequired(false)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('remove')
      .setDescription('Remove a user from quarantine')
      .addUserOption(option =>
        option
          .setName('user')
          .setDescription('User to remove from quarantine')
          .setRequired(true)
      )
  );

export const category = 'moderation';
export const permissions = [PermissionFlagsBits.ManageRoles];

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

  if (subcommand === 'add') {
    await handleQuarantineAdd(interaction, userLang);
  } else if (subcommand === 'remove') {
    await handleQuarantineRemove(interaction, userLang);
  }
}

async function handleQuarantineAdd(interaction: ChatInputCommandInteraction, userLang: string) {
  const targetUser = interaction.options.getUser('user', true);
  const reason = interaction.options.getString('reason', true);
  const quarantineRole = interaction.options.getRole('role') as Role | null;

  if (targetUser.id === interaction.user.id) {
    await interaction.reply({
      content: t('moderation.quarantine.cannot_quarantine_self', {}, userLang),
      ephemeral: true
    });
    return;
  }

  if (targetUser.bot) {
    await interaction.reply({
      content: t('moderation.quarantine.cannot_quarantine_bot', {}, userLang),
      ephemeral: true
    });
    return;
  }

  const targetMember = await interaction.guild!.members.fetch(targetUser.id).catch(() => null);
  if (!targetMember) {
    await interaction.reply({
      content: t('errors.user_not_found', {}, userLang),
      ephemeral: true
    });
    return;
  }

  const executorMember = await interaction.guild!.members.fetch(interaction.user.id);
  
  if (targetMember.roles.highest.position >= executorMember.roles.highest.position) {
    await interaction.reply({
      content: t('moderation.quarantine.higher_role', {}, userLang),
      ephemeral: true
    });
    return;
  }

  const existingQuarantine = await prisma.quarantine.findUnique({
    where: {
      userId_guildId: {
        userId: targetUser.id,
        guildId: interaction.guild!.id
      }
    }
  });

  if (existingQuarantine && existingQuarantine.active) {
    await interaction.reply({
      content: t('moderation.quarantine.already_quarantined', {}, userLang),
      ephemeral: true
    });
    return;
  }

  await interaction.deferReply();

  try {
    const currentRoles = targetMember.roles.cache
      .filter(role => role.id !== interaction.guild!.id)
      .map(role => role.id);

    const rolesToRemove = targetMember.roles.cache.filter(
      role => role.id !== interaction.guild!.id && role.managed === false
    );

    await targetMember.roles.remove(rolesToRemove);

    if (quarantineRole) {
      await targetMember.roles.add(quarantineRole);
    }

    await prisma.quarantine.upsert({
      where: {
        userId_guildId: {
          userId: targetUser.id,
          guildId: interaction.guild!.id
        }
      },
      update: {
        moderatorId: interaction.user.id,
        reason: reason,
        roleIds: currentRoles,
        active: true,
        createdAt: new Date()
      },
      create: {
        userId: targetUser.id,
        guildId: interaction.guild!.id,
        moderatorId: interaction.user.id,
        reason: reason,
        roleIds: currentRoles,
        active: true
      }
    });

    await prisma.modAction.create({
      data: {
        userId: targetUser.id,
        guildId: interaction.guild!.id,
        moderatorId: interaction.user.id,
        action: 'quarantine',
        reason: reason
      }
    });

    const embed = new EmbedBuilder()
      .setTitle(t('moderation.quarantine.add_title', {}, userLang))
      .setColor('#ff0000')
      .setDescription(t('moderation.quarantine.add_description', {
        user: targetUser.toString(),
        moderator: interaction.user.toString()
      }, userLang))
      .addFields(
        {
          name: t('moderation.quarantine.reason', {}, userLang),
          value: reason,
          inline: false
        },
        {
          name: t('moderation.quarantine.roles_removed', {}, userLang),
          value: currentRoles.length.toString(),
          inline: true
        }
      )
      .setTimestamp();

    if (quarantineRole) {
      embed.addFields({
        name: t('moderation.quarantine.role_assigned', {}, userLang),
        value: quarantineRole.toString(),
        inline: true
      });
    }

    await interaction.editReply({ embeds: [embed] });

    try {
      const dmEmbed = new EmbedBuilder()
        .setTitle(t('moderation.quarantine.dm_title', {}, userLang))
        .setColor('#ff0000')
        .setDescription(t('moderation.quarantine.dm_description', {
          guild: interaction.guild!.name,
          reason: reason
        }, userLang))
        .setTimestamp();

      await targetUser.send({ embeds: [dmEmbed] });
    } catch (error) {
      console.log(`Could not DM user ${targetUser.id}`);
    }

  } catch (error) {
    console.error('Error quarantining user:', error);
    await interaction.editReply({
      content: t('moderation.quarantine.error', {}, userLang)
    });
  }
}

async function handleQuarantineRemove(interaction: ChatInputCommandInteraction, userLang: string) {
  const targetUser = interaction.options.getUser('user', true);

  const quarantine = await prisma.quarantine.findUnique({
    where: {
      userId_guildId: {
        userId: targetUser.id,
        guildId: interaction.guild!.id
      }
    }
  });

  if (!quarantine || !quarantine.active) {
    await interaction.reply({
      content: t('moderation.quarantine.not_quarantined', {}, userLang),
      ephemeral: true
    });
    return;
  }

  const targetMember = await interaction.guild!.members.fetch(targetUser.id).catch(() => null);
  if (!targetMember) {
    await interaction.reply({
      content: t('errors.user_not_found', {}, userLang),
      ephemeral: true
    });
    return;
  }

  await interaction.deferReply();

  try {
    const rolesToRestore: Role[] = [];
    for (const roleId of quarantine.roleIds) {
      const role = interaction.guild!.roles.cache.get(roleId);
      if (role) {
        rolesToRestore.push(role);
      }
    }

    await targetMember.roles.add(rolesToRestore);

    const quarantineRoles = targetMember.roles.cache.filter(
      role => role.name.toLowerCase().includes('quarantine') || 
              role.name.toLowerCase().includes('muted')
    );
    
    if (quarantineRoles.size > 0) {
      await targetMember.roles.remove(quarantineRoles);
    }

    await prisma.quarantine.update({
      where: {
        userId_guildId: {
          userId: targetUser.id,
          guildId: interaction.guild!.id
        }
      },
      data: {
        active: false
      }
    });

    await prisma.modAction.create({
      data: {
        userId: targetUser.id,
        guildId: interaction.guild!.id,
        moderatorId: interaction.user.id,
        action: 'unquarantine',
        reason: 'Quarantine removed'
      }
    });

    const embed = new EmbedBuilder()
      .setTitle(t('moderation.quarantine.remove_title', {}, userLang))
      .setColor('#00ff00')
      .setDescription(t('moderation.quarantine.remove_description', {
        user: targetUser.toString(),
        moderator: interaction.user.toString()
      }, userLang))
      .addFields({
        name: t('moderation.quarantine.roles_restored', {}, userLang),
        value: rolesToRestore.length.toString(),
        inline: true
      })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });

    try {
      const dmEmbed = new EmbedBuilder()
        .setTitle(t('moderation.quarantine.dm_remove_title', {}, userLang))
        .setColor('#00ff00')
        .setDescription(t('moderation.quarantine.dm_remove_description', {
          guild: interaction.guild!.name
        }, userLang))
        .setTimestamp();

      await targetUser.send({ embeds: [dmEmbed] });
    } catch (error) {
      console.log(`Could not DM user ${targetUser.id}`);
    }

  } catch (error) {
    console.error('Error removing quarantine:', error);
    await interaction.editReply({
      content: t('moderation.quarantine.remove_error', {}, userLang)
    });
  }
}