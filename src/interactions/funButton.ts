import { 
  ButtonInteraction, 
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} from 'discord.js';
import { prisma } from '../utils/database';

export async function handleFunButton(interaction: ButtonInteraction) {
  if (!interaction.guild) return;

  const customId = interaction.customId;
  
  if (customId.startsWith('social_react:')) {
    await handleSocialReaction(interaction);
  } else if (customId.startsWith('trivia_answer:')) {
    await handleTriviaAnswer(interaction);
  } else if (customId.startsWith('riddle_')) {
    await handleRiddleButton(interaction);
  }
}

async function handleSocialReaction(interaction: ButtonInteraction) {
  const [, action, senderId] = interaction.customId.split(':');
  
  if (interaction.user.id === senderId) {
    await interaction.reply({
      content: 'You cannot react to your own social action! 😅',
      ephemeral: true
    });
    return;
  }

  const existingReaction = await prisma.socialReaction.findUnique({
    where: {
      interactionId_userId: {
        interactionId: `${action}_${senderId}_${interaction.message.id}`,
        userId: interaction.user.id
      }
    }
  });

  if (existingReaction) {
    await interaction.reply({
      content: 'You already reacted to this! ❤️',
      ephemeral: true
    });
    return;
  }

  await prisma.socialReaction.create({
    data: {
      interactionId: `${action}_${senderId}_${interaction.message.id}`,
      userId: interaction.user.id,
      guildId: interaction.guild!.id,
      emoji: '❤️'
    }
  });

  const reactionCount = await prisma.socialReaction.count({
    where: {
      interactionId: `${action}_${senderId}_${interaction.message.id}`
    }
  });

  const embed = EmbedBuilder.from(interaction.message.embeds[0]);
  embed.setFooter({ text: `❤️ ${reactionCount} reaction(s)` });

  await interaction.update({ embeds: [embed] });

  await interaction.followUp({
    content: 'Added your reaction! ❤️',
    ephemeral: true
  });
}

async function handleTriviaAnswer(interaction: ButtonInteraction) {
  const [, answerIndex, correctAnswer] = interaction.customId.split(':');
  const embed = EmbedBuilder.from(interaction.message.embeds[0]);
  const options = embed.toJSON().fields?.[0].value.split('\n') || [];
  const selectedOption = options[parseInt(answerIndex)];
  
  const isCorrect = selectedOption.toLowerCase().includes(correctAnswer.toLowerCase());
  
  const resultEmbed = new EmbedBuilder()
    .setTitle('🧠 Trivia Result')
    .setDescription(embed.toJSON().description || '')
    .addFields(
      { name: 'Your Answer', value: selectedOption, inline: true },
      { name: 'Correct Answer', value: correctAnswer, inline: true },
      { name: 'Result', value: isCorrect ? '✅ Correct!' : '❌ Incorrect!', inline: true }
    )
    .setColor(isCorrect ? '#2ecc71' : '#e74c3c')
    .setFooter({ text: `Answered by ${interaction.user.username}` })
    .setTimestamp();

  await interaction.update({ embeds: [resultEmbed], components: [] });

  await prisma.gameStats.upsert({
    where: {
      userId_guildId_game: {
        userId: interaction.user.id,
        guildId: interaction.guild!.id,
        game: 'trivia'
      }
    },
    update: {
      gamesPlayed: { increment: 1 },
      gamesWon: isCorrect ? { increment: 1 } : undefined
    },
    create: {
      userId: interaction.user.id,
      guildId: interaction.guild!.id,
      game: 'trivia',
      gamesPlayed: 1,
      gamesWon: isCorrect ? 1 : 0
    }
  });
}

async function handleRiddleButton(interaction: ButtonInteraction) {
  const [, type, encodedData] = interaction.customId.split(':');
  const data = Buffer.from(encodedData, 'base64').toString();
  
  if (type === 'hint') {
    await interaction.reply({
      content: `💡 **Hint:** ${data}`,
      ephemeral: true
    });
  } else if (type === 'answer') {
    const embed = EmbedBuilder.from(interaction.message.embeds[0]);
    embed.addFields({ name: '💡 Answer', value: data, inline: false });
    embed.setColor('#2ecc71');
    
    await interaction.update({ embeds: [embed], components: [] });
  }
}