import { 
  ButtonInteraction, 
  EmbedBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} from 'discord.js';
import { prisma } from '../utils/database';
import { getUserLanguage, t } from '../utils/i18n';

export async function handlePollButton(interaction: ButtonInteraction) {
  if (!interaction.guild) return;

  const [action, data] = interaction.customId.split(':');
  
  if (action === 'poll_vote') {
    await handlePollVote(interaction, parseInt(data));
  } else if (interaction.customId === 'poll_results') {
    await handlePollResults(interaction);
  } else if (interaction.customId === 'poll_participants') {
    await handlePollParticipants(interaction);
  }
}

async function handlePollVote(interaction: ButtonInteraction, optionId: number) {
  const poll = await prisma.poll.findUnique({
    where: { messageId: interaction.message.id },
    include: {
      options: {
        include: {
          votes: {
            where: { userId: interaction.user.id }
          }
        }
      },
      votes: {
        where: { userId: interaction.user.id }
      }
    }
  });

  if (!poll) {
    await interaction.reply({
      content: 'Poll not found.',
      ephemeral: true
    });
    return;
  }

  if (!poll.active) {
    await interaction.reply({
      content: 'This poll has ended.',
      ephemeral: true
    });
    return;
  }

  if (poll.endTime && new Date() > poll.endTime) {
    await prisma.poll.update({
      where: { id: poll.id },
      data: { active: false }
    });
    
    await interaction.reply({
      content: 'This poll has ended.',
      ephemeral: true
    });
    return;
  }

  const selectedOption = poll.options.find(opt => opt.optionId === optionId);
  if (!selectedOption) {
    await interaction.reply({
      content: 'Invalid option.',
      ephemeral: true
    });
    return;
  }

  const userVotes = poll.votes;
  const hasVotedForOption = selectedOption.votes.length > 0;

  if (hasVotedForOption) {
    await prisma.pollVote.delete({
      where: {
        pollId_userId: {
          pollId: poll.id,
          userId: interaction.user.id
        }
      }
    });

    await interaction.reply({
      content: `Removed your vote for **${selectedOption.label}**`,
      ephemeral: true
    });
  } else {
    if (userVotes.length >= poll.maxVotes) {
      if (!poll.allowChange) {
        await interaction.reply({
          content: `You have already voted ${poll.maxVotes} time(s) and vote changing is not allowed.`,
          ephemeral: true
        });
        return;
      }

      if (poll.maxVotes === 1) {
        await prisma.pollVote.deleteMany({
          where: {
            pollId: poll.id,
            userId: interaction.user.id
          }
        });
      } else {
        await interaction.reply({
          content: `You have reached the maximum of ${poll.maxVotes} votes. Remove a vote first.`,
          ephemeral: true
        });
        return;
      }
    }

    await prisma.pollVote.create({
      data: {
        pollId: poll.id,
        optionId: selectedOption.id,
        userId: interaction.user.id,
        guildId: interaction.guild!.id
      }
    });

    await interaction.reply({
      content: `Voted for **${selectedOption.label}**`,
      ephemeral: true
    });
  }

  if (poll.showResults) {
    await updatePollMessage(interaction, poll.id);
  }
}

async function handlePollResults(interaction: ButtonInteraction) {
  const poll = await prisma.poll.findUnique({
    where: { messageId: interaction.message.id },
    include: {
      options: {
        include: {
          _count: {
            select: { votes: true }
          }
        }
      },
      _count: {
        select: { votes: true }
      }
    }
  });

  if (!poll) {
    await interaction.reply({
      content: 'Poll not found.',
      ephemeral: true
    });
    return;
  }

  const totalVotes = poll._count.votes;
  const embed = new EmbedBuilder()
    .setTitle(`📊 ${poll.title} - Results`)
    .setColor('#7289da')
    .setDescription(`Total votes: ${totalVotes}`)
    .setTimestamp();

  const sortedOptions = poll.options.sort((a, b) => b._count.votes - a._count.votes);

  sortedOptions.forEach((option, index) => {
    const votes = option._count.votes;
    const percentage = totalVotes > 0 ? (votes / totalVotes * 100).toFixed(1) : '0.0';
    const barLength = Math.round((votes / Math.max(...poll.options.map(o => o._count.votes), 1)) * 20);
    const bar = '█'.repeat(barLength) + '░'.repeat(20 - barLength);
    
    embed.addFields({
      name: `${index + 1}. ${option.emoji} ${option.label}`,
      value: `${bar}\n${votes} votes (${percentage}%)`,
      inline: false
    });
  });

  if (poll.endTime) {
    embed.addFields({
      name: 'Status',
      value: new Date() > poll.endTime ? '🔴 Ended' : `⏱️ Ends <t:${Math.floor(poll.endTime.getTime() / 1000)}:R>`,
      inline: true
    });
  }

  await interaction.reply({
    embeds: [embed],
    ephemeral: true
  });
}

async function handlePollParticipants(interaction: ButtonInteraction) {
  const member = interaction.member;
  if (!member || typeof member.permissions === 'string') {
    return;
  }

  const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);
  
  const poll = await prisma.poll.findUnique({
    where: { messageId: interaction.message.id }
  });

  if (!poll) {
    await interaction.reply({
      content: 'Poll not found.',
      ephemeral: true
    });
    return;
  }

  if (!isAdmin && poll.creatorId !== interaction.user.id) {
    await interaction.reply({
      content: 'Only administrators and the poll creator can view participants.',
      ephemeral: true
    });
    return;
  }

  const votes = await prisma.pollVote.findMany({
    where: { pollId: poll.id },
    include: {
      option: true,
      user: true
    },
    orderBy: [
      { option: { optionId: 'asc' } },
      { votedAt: 'asc' }
    ]
  });

  if (votes.length === 0) {
    await interaction.reply({
      content: 'No votes yet.',
      ephemeral: true
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle(`👥 ${poll.title} - Participants`)
    .setColor('#7289da')
    .setDescription(`Total participants: ${new Set(votes.map(v => v.userId)).size}`)
    .setTimestamp();

  interface VoteGroup {
    option: any;
    voters: string[];
  }

  const votesByOption = votes.reduce<Record<number, VoteGroup>>((acc, vote) => {
    const key = vote.option.optionId;
    if (!acc[key]) {
      acc[key] = {
        option: vote.option,
        voters: []
      };
    }
    acc[key].voters.push(vote.user.username || `User#${vote.userId.slice(-4)}`);
    return acc;
  }, {});

  const sortedEntries = Object.values(votesByOption) as VoteGroup[];
  
  sortedEntries
    .sort((a, b) => a.option.optionId - b.option.optionId)
    .forEach(({ option, voters }) => {
      const voterList = voters.slice(0, 10).join(', ');
      const remaining = voters.length > 10 ? `\n...and ${voters.length - 10} more` : '';
      
      embed.addFields({
        name: `${option.emoji} ${option.label} (${voters.length} votes)`,
        value: voterList + remaining,
        inline: false
      });
    });

  await interaction.reply({
    embeds: [embed],
    ephemeral: true
  });
}

async function updatePollMessage(interaction: ButtonInteraction, pollId: string) {
  const poll = await prisma.poll.findUnique({
    where: { id: pollId },
    include: {
      options: {
        include: {
          _count: {
            select: { votes: true }
          }
        }
      },
      _count: {
        select: { votes: true }
      }
    }
  });

  if (!poll) return;

  const embed = EmbedBuilder.from(interaction.message.embeds[0]);
  
  const options = poll.options.map(opt => ({
    label: opt.label,
    emoji: opt.emoji || '',
    votes: opt._count.votes
  }));

  updatePollEmbed(embed, options, poll.endTime, poll.maxVotes, poll._count.votes);

  await interaction.message.edit({ embeds: [embed] });
}

function updatePollEmbed(
  embed: EmbedBuilder, 
  options: { label: string; emoji: string; votes: number }[],
  endTime: Date | null,
  maxVotes: number,
  totalVotes: number
) {
  const maxVoteCount = Math.max(...options.map(o => o.votes), 1);
  
  const optionFields = options.map(opt => {
    const percentage = totalVotes > 0 ? (opt.votes / totalVotes * 100).toFixed(1) : '0.0';
    const barLength = Math.round((opt.votes / maxVoteCount) * 20);
    const bar = '█'.repeat(barLength) + '░'.repeat(20 - barLength);
    
    return `${opt.emoji} **${opt.label}**\n${bar} ${opt.votes} votes (${percentage}%)`;
  });

  const chunkedFields: string[] = [];
  for (let i = 0; i < optionFields.length; i += 5) {
    chunkedFields.push(optionFields.slice(i, i + 5).join('\n\n'));
  }

  embed.setFields();
  
  chunkedFields.forEach((chunk, index) => {
    embed.addFields({
      name: index === 0 ? `Results (${totalVotes} total votes)` : '\u200b',
      value: chunk,
      inline: false
    });
  });

  if (endTime) {
    embed.addFields({
      name: 'Ends',
      value: `<t:${Math.floor(endTime.getTime() / 1000)}:R>`,
      inline: true
    });
  }

  embed.addFields({
    name: 'Max Votes',
    value: `${maxVotes} per user`,
    inline: true
  });
}