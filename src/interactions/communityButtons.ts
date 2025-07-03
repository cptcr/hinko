import { 
  ButtonInteraction, 
  EmbedBuilder,
  PermissionFlagsBits,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ModalSubmitInteraction,
  ButtonBuilder,
  ButtonStyle
} from 'discord.js';
import { prisma } from '../utils/database';
import { getUserLanguage, t } from '../utils/i18n';

export async function handleCommunityButton(interaction: ButtonInteraction | ModalSubmitInteraction) {
  if (!interaction.guild) return;

  const customId = interaction.customId;
  
  if (customId.startsWith('confession_react:')) {
    await handleConfessionReaction(interaction as ButtonInteraction);
  } else if (customId.startsWith('suggestion_vote:')) {
    await handleSuggestionVote(interaction as ButtonInteraction);
  } else if (customId.startsWith('report_action:')) {
    await handleReportAction(interaction as ButtonInteraction);
  } else if (customId.startsWith('suggestion_status:')) {
    await handleSuggestionStatus(interaction as ButtonInteraction);
  }
}

async function handleConfessionReaction(interaction: ButtonInteraction) {
  const [, confessionNumber, emoji] = interaction.customId.split(':');
  
  const existingReaction = await prisma.confessionReaction.findUnique({
    where: {
      confessionNumber_userId_guildId: {
        confessionNumber: parseInt(confessionNumber),
        userId: interaction.user.id,
        guildId: interaction.guild!.id
      }
    }
  });

  if (existingReaction) {
    if (existingReaction.emoji === emoji) {
      await prisma.confessionReaction.delete({
        where: { id: existingReaction.id }
      });
      
      await interaction.reply({
        content: `Removed your ${emoji} reaction`,
        ephemeral: true
      });
    } else {
      await prisma.confessionReaction.update({
        where: { id: existingReaction.id },
        data: { emoji: emoji }
      });
      
      await interaction.reply({
        content: `Changed your reaction to ${emoji}`,
        ephemeral: true
      });
    }
  } else {
    await prisma.confessionReaction.create({
      data: {
        confessionNumber: parseInt(confessionNumber),
        userId: interaction.user.id,
        guildId: interaction.guild!.id,
        emoji: emoji
      }
    });
    
    await interaction.reply({
      content: `Added ${emoji} reaction`,
      ephemeral: true
    });
  }

  await updateConfessionReactions(interaction, parseInt(confessionNumber));
}

async function handleSuggestionVote(interaction: ButtonInteraction) {
  const [, suggestionNumber, voteType] = interaction.customId.split(':');
  
  const suggestion = await prisma.suggestion.findFirst({
    where: {
      guildId: interaction.guild!.id,
      number: parseInt(suggestionNumber)
    }
  });

  if (!suggestion) {
    await interaction.reply({
      content: 'Suggestion not found.',
      ephemeral: true
    });
    return;
  }

  if (suggestion.userId === interaction.user.id) {
    await interaction.reply({
      content: 'You cannot vote on your own suggestion!',
      ephemeral: true
    });
    return;
  }

  const existingVote = await prisma.suggestionVote.findUnique({
    where: {
      suggestionId_userId: {
        suggestionId: suggestion.id,
        userId: interaction.user.id
      }
    }
  });

  if (existingVote) {
    if (existingVote.voteType === voteType) {
      await prisma.suggestionVote.delete({
        where: { id: existingVote.id }
      });
      
      await interaction.reply({
        content: `Removed your ${voteType === 'upvote' ? '👍' : '👎'} vote`,
        ephemeral: true
      });
    } else {
      await prisma.suggestionVote.update({
        where: { id: existingVote.id },
        data: { voteType: voteType }
      });
      
      await interaction.reply({
        content: `Changed your vote to ${voteType === 'upvote' ? '👍' : '👎'}`,
        ephemeral: true
      });
    }
  } else {
    await prisma.suggestionVote.create({
      data: {
        suggestionId: suggestion.id,
        userId: interaction.user.id,
        voteType: voteType
      }
    });
    
    await interaction.reply({
      content: `Added ${voteType === 'upvote' ? '👍' : '👎'} vote`,
      ephemeral: true
    });
  }

  await updateSuggestionVotes(interaction, suggestion.id);
}

async function handleReportAction(interaction: ButtonInteraction) {
  const [, reportNumber, action] = interaction.customId.split(':');
  
  const member = interaction.member;
  if (!member || typeof member.permissions === 'string') return;

  const hasPermission = member.permissions.has(PermissionFlagsBits.ModerateMembers) ||
                       member.permissions.has(PermissionFlagsBits.Administrator);

  if (!hasPermission) {
    await interaction.reply({
      content: 'You do not have permission to manage reports.',
      ephemeral: true
    });
    return;
  }

  const report = await prisma.report.findFirst({
    where: {
      guildId: interaction.guild!.id,
      number: parseInt(reportNumber)
    }
  });

  if (!report) {
    await interaction.reply({
      content: 'Report not found.',
      ephemeral: true
    });
    return;
  }

  let newStatus = report.status;
  let statusEmoji = '🔴';
  let statusText = 'Open';

  switch (action) {
    case 'investigate':
      newStatus = 'investigating';
      statusEmoji = '🔍';
      statusText = 'Under Investigation';
      break;
    case 'resolve':
      newStatus = 'resolved';
      statusEmoji = '✅';
      statusText = 'Resolved';
      break;
    case 'dismiss':
      newStatus = 'dismissed';
      statusEmoji = '❌';
      statusText = 'Dismissed';
      break;
  }

  await prisma.report.update({
    where: { id: report.id },
    data: { 
      status: newStatus,
      handledBy: interaction.user.id,
      handledAt: new Date()
    }
  });

  const embed = EmbedBuilder.from(interaction.message.embeds[0]);
  const fields = embed.toJSON().fields || [];
  
  const statusFieldIndex = fields.findIndex(f => f.name === 'Status');
  if (statusFieldIndex !== -1) {
    fields[statusFieldIndex].value = `${statusEmoji} ${statusText}`;
  }
  
  fields.push({
    name: 'Handled by',
    value: interaction.user.toString(),
    inline: true
  });

  embed.setFields(fields);
  embed.setColor(newStatus === 'resolved' ? '#00ff00' : 
                newStatus === 'dismissed' ? '#808080' : '#ffaa00');

  const updatedButtons = new ActionRowBuilder<ButtonBuilder>();
  
  if (newStatus !== 'resolved' && newStatus !== 'dismissed') {
    updatedButtons.addComponents(
      new ButtonBuilder()
        .setCustomId(`report_action:${reportNumber}:resolve`)
        .setLabel('Resolve')
        .setEmoji('✅')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`report_action:${reportNumber}:dismiss`)
        .setLabel('Dismiss')
        .setEmoji('❌')
        .setStyle(ButtonStyle.Secondary)
    );
  }

  await interaction.update({ 
    embeds: [embed], 
    components: updatedButtons.components.length > 0 ? [updatedButtons] : [] 
  });

  if (action === 'resolve' || action === 'dismiss') {
    try {
      const reporter = await interaction.client.users.fetch(report.reporterId);
      const dmEmbed = new EmbedBuilder()
        .setTitle(`📋 Report Update #${reportNumber}`)
        .setDescription(`Your report has been **${statusText.toLowerCase()}** by the moderation team.`)
        .setColor(newStatus === 'resolved' ? '#00ff00' : '#808080')
        .addFields({ name: 'Original Reason', value: report.reason, inline: false })
        .setTimestamp();

      await reporter.send({ embeds: [dmEmbed] });
    } catch (error) {
      console.log(`Could not DM report update to ${report.reporterId}`);
    }
  }
}

async function handleSuggestionStatus(interaction: ButtonInteraction) {
  const [, suggestionId, newStatus] = interaction.customId.split(':');
  
  const member = interaction.member;
  if (!member || typeof member.permissions === 'string') return;

  if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({
      content: 'Only administrators can change suggestion status.',
      ephemeral: true
    });
    return;
  }

  const suggestion = await prisma.suggestion.findUnique({
    where: { id: suggestionId }
  });

  if (!suggestion) {
    await interaction.reply({
      content: 'Suggestion not found.',
      ephemeral: true
    });
    return;
  }

  const modal = new ModalBuilder()
    .setCustomId(`suggestion_status_modal:${suggestionId}:${newStatus}`)
    .setTitle(`${newStatus.charAt(0).toUpperCase() + newStatus.slice(1)} Suggestion`);

  const reasonInput = new TextInputBuilder()
    .setCustomId('reason')
    .setLabel('Reason/Comment (optional)')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setMaxLength(500);

  const row = new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput);
  modal.addComponents(row);

  await interaction.showModal(modal);
}

export async function handleSuggestionStatusModal(interaction: ModalSubmitInteraction) {
  const [, suggestionId, newStatus] = interaction.customId.split(':');
  const reason = interaction.fields.getTextInputValue('reason') || 'No reason provided';

  const suggestion = await prisma.suggestion.findUnique({
    where: { id: suggestionId }
  });

  if (!suggestion) {
    await interaction.reply({
      content: 'Suggestion not found.',
      ephemeral: true
    });
    return;
  }

  await prisma.suggestion.update({
    where: { id: suggestionId },
    data: { 
      status: newStatus,
      adminComment: reason,
      reviewedBy: interaction.user.id,
      reviewedAt: new Date()
    }
  });

  const statusColors: Record<string, number> = {
    'approved': 0x00ff00,
    'rejected': 0xff0000,
    'considering': 0xffaa00,
    'implemented': 0x9966cc
  };

  const statusEmojis: Record<string, string> = {
    'approved': '✅',
    'rejected': '❌',
    'considering': '🤔',
    'implemented': '🎉'
  };

  const embed = EmbedBuilder.from(interaction.message!.embeds[0]);
  const fields = embed.toJSON().fields || [];
  
  const statusFieldIndex = fields.findIndex(f => f.name === 'Status');
  if (statusFieldIndex !== -1) {
    fields[statusFieldIndex].value = `${statusEmojis[newStatus]} ${newStatus.charAt(0).toUpperCase() + newStatus.slice(1)}`;
  }

  fields.push({
    name: 'Admin Comment',
    value: reason,
    inline: false
  }, {
    name: 'Reviewed by',
    value: interaction.user.toString(),
    inline: true
  });

  embed.setFields(fields);
  embed.setColor(statusColors[newStatus]);

  const adminButtons = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`suggestion_status:${suggestionId}:approved`)
        .setLabel('Approve')
        .setEmoji('✅')
        .setStyle(ButtonStyle.Success)
        .setDisabled(newStatus === 'approved'),
      new ButtonBuilder()
        .setCustomId(`suggestion_status:${suggestionId}:rejected`)
        .setLabel('Reject')
        .setEmoji('❌')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(newStatus === 'rejected'),
      new ButtonBuilder()
        .setCustomId(`suggestion_status:${suggestionId}:considering`)
        .setLabel('Consider')
        .setEmoji('🤔')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(newStatus === 'considering'),
      new ButtonBuilder()
        .setCustomId(`suggestion_status:${suggestionId}:implemented`)
        .setLabel('Implemented')
        .setEmoji('🎉')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(newStatus === 'implemented')
    );

  await interaction.editReply({ embeds: [embed], components: [adminButtons] });

  try {
    const suggester = await interaction.client.users.fetch(suggestion.userId);
    const dmEmbed = new EmbedBuilder()
      .setTitle(`💡 Suggestion Update #${suggestion.number}`)
      .setDescription(`Your suggestion "${suggestion.title}" has been **${newStatus}**!`)
      .setColor(statusColors[newStatus])
      .addFields(
        { name: 'Status', value: `${statusEmojis[newStatus]} ${newStatus.charAt(0).toUpperCase() + newStatus.slice(1)}`, inline: true },
        { name: 'Admin Comment', value: reason, inline: false }
      )
      .setTimestamp();

    await suggester.send({ embeds: [dmEmbed] });
  } catch (error) {
    console.log(`Could not DM suggestion update to ${suggestion.userId}`);
  }

  await interaction.followUp({
    content: `✅ Suggestion #${suggestion.number} status updated to **${newStatus}**`,
    ephemeral: true
  });
}

async function updateConfessionReactions(interaction: ButtonInteraction, confessionNumber: number) {
  const reactions = await prisma.confessionReaction.groupBy({
    by: ['emoji'],
    where: {
      confessionNumber: confessionNumber,
      guildId: interaction.guild!.id
    },
    _count: { emoji: true }
  });

  const reactionText = reactions.length > 0 
    ? reactions.map(r => `${r.emoji} ${r._count.emoji}`).join(' • ')
    : 'No reactions yet';

  const embed = EmbedBuilder.from(interaction.message.embeds[0]);
  embed.setFooter({ text: `Anonymous confession • ${reactionText}` });

  await interaction.message.edit({ embeds: [embed] });
}

async function updateSuggestionVotes(interaction: ButtonInteraction, suggestionId: string) {
  const votes = await prisma.suggestionVote.groupBy({
    by: ['voteType'],
    where: { suggestionId: suggestionId },
    _count: { voteType: true }
  });

  const upvotes = votes.find(v => v.voteType === 'upvote')?._count.voteType || 0;
  const downvotes = votes.find(v => v.voteType === 'downvote')?._count.voteType || 0;

  const voteButtons = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`suggestion_vote:${suggestionId.split('-')[0]}:upvote`)
        .setEmoji('👍')
        .setLabel(`Upvote (${upvotes})`)
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`suggestion_vote:${suggestionId.split('-')[0]}:downvote`)
        .setEmoji('👎')
        .setLabel(`Downvote (${downvotes})`)
        .setStyle(ButtonStyle.Danger)
    );

  const member = interaction.member;
  if (member && typeof member.permissions !== 'string' && 
      member.permissions.has(PermissionFlagsBits.Administrator)) {
    
    voteButtons.addComponents(
      new ButtonBuilder()
        .setCustomId(`suggestion_status:${suggestionId}:approved`)
        .setLabel('Approve')
        .setEmoji('✅')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`suggestion_status:${suggestionId}:rejected`)
        .setLabel('Reject')
        .setEmoji('❌')
        .setStyle(ButtonStyle.Secondary)
    );
  }

  await interaction.message.edit({ components: [voteButtons] });
}