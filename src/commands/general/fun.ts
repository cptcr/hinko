import { 
  SlashCommandBuilder, 
  ChatInputCommandInteraction, 
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ComponentType
} from 'discord.js';
import { prisma } from '../../utils/database';
import { getUserLanguage, t } from '../../utils/i18n';

export const data = new SlashCommandBuilder()
  .setName('fun')
  .setDescription('Fun and entertainment commands')
  .addSubcommand(subcommand =>
    subcommand
      .setName('8ball')
      .setDescription('Ask the magic 8-ball a question')
      .addStringOption(option =>
        option
          .setName('question')
          .setDescription('Your question for the 8-ball')
          .setRequired(true)
          .setMaxLength(200)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('coinflip')
      .setDescription('Flip a coin')
      .addStringOption(option =>
        option
          .setName('choice1')
          .setDescription('First option')
          .setRequired(false)
          .setMaxLength(50)
      )
      .addStringOption(option =>
        option
          .setName('choice2')
          .setDescription('Second option')
          .setRequired(false)
          .setMaxLength(50)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('dice')
      .setDescription('Roll dice')
      .addIntegerOption(option =>
        option
          .setName('sides')
          .setDescription('Number of sides on the die')
          .setRequired(false)
          .setMinValue(2)
          .setMaxValue(100)
      )
      .addIntegerOption(option =>
        option
          .setName('count')
          .setDescription('Number of dice to roll')
          .setRequired(false)
          .setMinValue(1)
          .setMaxValue(10)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('rps')
      .setDescription('Play Rock Paper Scissors')
      .addStringOption(option =>
        option
          .setName('choice')
          .setDescription('Your choice')
          .setRequired(true)
          .addChoices(
            { name: '🪨 Rock', value: 'rock' },
            { name: '📄 Paper', value: 'paper' },
            { name: '✂️ Scissors', value: 'scissors' }
          )
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('trivia')
      .setDescription('Start a trivia question')
      .addStringOption(option =>
        option
          .setName('category')
          .setDescription('Trivia category')
          .setRequired(false)
          .addChoices(
            { name: 'General Knowledge', value: 'general' },
            { name: 'Science', value: 'science' },
            { name: 'History', value: 'history' },
            { name: 'Sports', value: 'sports' },
            { name: 'Entertainment', value: 'entertainment' }
          )
      )
      .addStringOption(option =>
        option
          .setName('difficulty')
          .setDescription('Difficulty level')
          .setRequired(false)
          .addChoices(
            { name: 'Easy', value: 'easy' },
            { name: 'Medium', value: 'medium' },
            { name: 'Hard', value: 'hard' }
          )
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('joke')
      .setDescription('Get a random joke')
      .addStringOption(option =>
        option
          .setName('type')
          .setDescription('Type of joke')
          .setRequired(false)
          .addChoices(
            { name: 'Programming', value: 'programming' },
            { name: 'Dad Jokes', value: 'dad' },
            { name: 'Puns', value: 'puns' },
            { name: 'Random', value: 'random' }
          )
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('meme')
      .setDescription('Generate or get a random meme')
      .addStringOption(option =>
        option
          .setName('template')
          .setDescription('Meme template')
          .setRequired(false)
          .addChoices(
            { name: 'Drake Pointing', value: 'drake' },
            { name: 'Distracted Boyfriend', value: 'distracted' },
            { name: 'Change My Mind', value: 'changemind' },
            { name: 'Random', value: 'random' }
          )
      )
      .addStringOption(option =>
        option
          .setName('top_text')
          .setDescription('Top text for the meme')
          .setRequired(false)
          .setMaxLength(100)
      )
      .addStringOption(option =>
        option
          .setName('bottom_text')
          .setDescription('Bottom text for the meme')
          .setRequired(false)
          .setMaxLength(100)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('riddle')
      .setDescription('Get a riddle to solve')
      .addStringOption(option =>
        option
          .setName('difficulty')
          .setDescription('Riddle difficulty')
          .setRequired(false)
          .addChoices(
            { name: 'Easy', value: 'easy' },
            { name: 'Medium', value: 'medium' },
            { name: 'Hard', value: 'hard' }
          )
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('choose')
      .setDescription('Let the bot choose between options')
      .addStringOption(option =>
        option
          .setName('options')
          .setDescription('Options separated by commas (e.g., pizza, burgers, tacos)')
          .setRequired(true)
          .setMaxLength(500)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('slots')
      .setDescription('Play slot machine')
      .addIntegerOption(option =>
        option
          .setName('bet')
          .setDescription('Amount to bet (fun coins)')
          .setRequired(false)
          .setMinValue(1)
          .setMaxValue(1000)
      )
  );

export const category = 'general';

const eightBallResponses = [
  "🎱 It is certain",
  "🎱 Without a doubt", 
  "🎱 Yes definitely",
  "🎱 You may rely on it",
  "🎱 As I see it, yes",
  "🎱 Most likely",
  "🎱 Outlook good",
  "🎱 Yes",
  "🎱 Signs point to yes",
  "🎱 Reply hazy, try again",
  "🎱 Ask again later",
  "🎱 Better not tell you now",
  "🎱 Cannot predict now",
  "🎱 Concentrate and ask again",
  "🎱 Don't count on it",
  "🎱 My reply is no",
  "🎱 My sources say no",
  "🎱 Outlook not so good",
  "🎱 Very doubtful"
];

const jokes = {
  programming: [
    "Why do programmers prefer dark mode? Because light attracts bugs! 🐛",
    "How many programmers does it take to change a light bulb? None, that's a hardware problem! 💡",
    "Why don't programmers like nature? It has too many bugs! 🌳🐛",
    "What's a programmer's favorite hangout place? Foo Bar! 🍺",
    "Why did the programmer quit his job? He didn't get arrays! 💰"
  ],
  dad: [
    "I'm afraid for the calendar. Its days are numbered! 📅",
    "Why don't scientists trust atoms? Because they make up everything! ⚛️",
    "I used to hate facial hair, but then it grew on me! 🧔",
    "What do you call a fake noodle? An impasta! 🍝",
    "Did you hear about the mathematician who's afraid of negative numbers? He'll stop at nothing to avoid them! ➖"
  ],
  puns: [
    "I wondered why the baseball kept getting bigger. Then it hit me! ⚾",
    "The graveyard is so crowded, people are dying to get in! ⚰️",
    "I used to be a banker, but I lost interest! 💰",
    "Time flies like an arrow. Fruit flies like a banana! 🍌",
    "I'm reading a book about anti-gravity. It's impossible to put down! 📚"
  ]
};

const riddles = {
  easy: [
    {
      question: "What has keys but can't open locks?",
      answer: "piano",
      hint: "It makes music 🎹"
    },
    {
      question: "What gets wet while drying?",
      answer: "towel",
      hint: "You use it after a shower 🛁"
    }
  ],
  medium: [
    {
      question: "I speak without a mouth and hear without ears. What am I?",
      answer: "echo",
      hint: "You hear me in mountains and empty rooms 🏔️"
    },
    {
      question: "The more you take, the more you leave behind. What am I?",
      answer: "footsteps",
      hint: "You make them when walking 👣"
    }
  ],
  hard: [
    {
      question: "I have cities, but no houses. I have mountains, but no trees. I have water, but no fish. What am I?",
      answer: "map",
      hint: "You use me for navigation 🗺️"
    }
  ]
};

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
    case '8ball':
      await handle8Ball(interaction);
      break;
    case 'coinflip':
      await handleCoinflip(interaction);
      break;
    case 'dice':
      await handleDice(interaction);
      break;
    case 'rps':
      await handleRPS(interaction);
      break;
    case 'trivia':
      await handleTrivia(interaction);
      break;
    case 'joke':
      await handleJoke(interaction);
      break;
    case 'meme':
      await handleMeme(interaction);
      break;
    case 'riddle':
      await handleRiddle(interaction);
      break;
    case 'choose':
      await handleChoose(interaction);
      break;
    case 'slots':
      await handleSlots(interaction);
      break;
  }
}

async function handle8Ball(interaction: ChatInputCommandInteraction) {
  const question = interaction.options.getString('question', true);
  const response = eightBallResponses[Math.floor(Math.random() * eightBallResponses.length)];
  
  const embed = new EmbedBuilder()
    .setTitle('🎱 Magic 8-Ball')
    .addFields(
      { name: '❓ Question', value: question, inline: false },
      { name: '🔮 Answer', value: response, inline: false }
    )
    .setColor('#000000')
    .setFooter({ text: `Asked by ${interaction.user.username}` })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

async function handleCoinflip(interaction: ChatInputCommandInteraction) {
  const choice1 = interaction.options.getString('choice1') || 'Heads';
  const choice2 = interaction.options.getString('choice2') || 'Tails';
  const result = Math.random() < 0.5 ? choice1 : choice2;
  const emoji = result === choice1 ? '🪙' : '🪙';

  const embed = new EmbedBuilder()
    .setTitle('🪙 Coin Flip')
    .setDescription(`**Result: ${result}** ${emoji}`)
    .addFields(
      { name: 'Options', value: `${choice1} vs ${choice2}`, inline: false }
    )
    .setColor('#ffd700')
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

async function handleDice(interaction: ChatInputCommandInteraction) {
  const sides = interaction.options.getInteger('sides') || 6;
  const count = interaction.options.getInteger('count') || 1;
  
  const rolls: number[] = [];
  let total = 0;
  
  for (let i = 0; i < count; i++) {
    const roll = Math.floor(Math.random() * sides) + 1;
    rolls.push(roll);
    total += roll;
  }

  const embed = new EmbedBuilder()
    .setTitle(`🎲 Dice Roll (${count}d${sides})`)
    .addFields(
      { name: 'Rolls', value: rolls.join(', '), inline: true },
      { name: 'Total', value: total.toString(), inline: true }
    )
    .setColor('#ff6b6b')
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

async function handleRPS(interaction: ChatInputCommandInteraction) {
  const userChoice = interaction.options.getString('choice', true);
  const choices = ['rock', 'paper', 'scissors'];
  const botChoice = choices[Math.floor(Math.random() * choices.length)];
  
  const emojis = { rock: '🪨', paper: '📄', scissors: '✂️' };
  
  let result = '';
  if (userChoice === botChoice) {
    result = "It's a tie! 🤝";
  } else if (
    (userChoice === 'rock' && botChoice === 'scissors') ||
    (userChoice === 'paper' && botChoice === 'rock') ||
    (userChoice === 'scissors' && botChoice === 'paper')
  ) {
    result = 'You win! 🎉';
  } else {
    result = 'I win! 🤖';
  }

  const embed = new EmbedBuilder()
    .setTitle('🪨📄✂️ Rock Paper Scissors')
    .addFields(
      { name: 'Your Choice', value: `${emojis[userChoice as keyof typeof emojis]} ${userChoice}`, inline: true },
      { name: 'My Choice', value: `${emojis[botChoice as keyof typeof emojis]} ${botChoice}`, inline: true },
      { name: 'Result', value: result, inline: false }
    )
    .setColor('#4ecdc4')
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });

  await prisma.gameStats.upsert({
    where: {
      userId_guildId_game: {
        userId: interaction.user.id,
        guildId: interaction.guild!.id,
        game: 'rps'
      }
    },
    update: {
      gamesPlayed: { increment: 1 },
      gamesWon: result.includes('You win') ? { increment: 1 } : undefined
    },
    create: {
      userId: interaction.user.id,
      guildId: interaction.guild!.id,
      game: 'rps',
      gamesPlayed: 1,
      gamesWon: result.includes('You win') ? 1 : 0
    }
  });
}

async function handleTrivia(interaction: ChatInputCommandInteraction) {
  const category = interaction.options.getString('category') || 'general';
  const difficulty = interaction.options.getString('difficulty') || 'medium';

  const triviaQuestions: Record<string, any> = {
    general: [
      { q: "What is the capital of France?", a: ["Paris", "paris"], options: ["London", "Berlin", "Paris", "Madrid"] },
      { q: "How many continents are there?", a: ["7", "seven"], options: ["5", "6", "7", "8"] }
    ],
    science: [
      { q: "What is the chemical symbol for gold?", a: ["Au", "au"], options: ["Go", "Gd", "Au", "Ag"] },
      { q: "What planet is closest to the Sun?", a: ["Mercury", "mercury"], options: ["Venus", "Mercury", "Earth", "Mars"] }
    ]
  };

  const questions = triviaQuestions[category] || triviaQuestions.general;
  const question = questions[Math.floor(Math.random() * questions.length)];

  const embed = new EmbedBuilder()
    .setTitle(`🧠 Trivia - ${category.charAt(0).toUpperCase() + category.slice(1)}`)
    .setDescription(question.q)
    .addFields({
      name: 'Options',
      value: question.options.map((opt, i) => `${['A', 'B', 'C', 'D'][i]}. ${opt}`).join('\n'),
      inline: false
    })
    .setColor('#9b59b6')
    .setFooter({ text: 'You have 30 seconds to answer!' })
    .setTimestamp();

  const buttons = question.options.map((opt: string, i: number) => 
    new ButtonBuilder()
      .setCustomId(`trivia_answer:${i}:${question.a[0]}`)
      .setLabel(['A', 'B', 'C', 'D'][i])
      .setStyle(ButtonStyle.Primary)
  );

  const rows: any[] = [];
  for (let i = 0; i < buttons.length; i += 4) {
    rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(buttons.slice(i, i + 4)));
  }

  await interaction.reply({ embeds: [embed], components: rows });
}

async function handleJoke(interaction: ChatInputCommandInteraction) {
  const type = interaction.options.getString('type') || 'random';
  
  let joke = '';
  if (type === 'random') {
    const allJokes = [...jokes.programming, ...jokes.dad, ...jokes.puns];
    joke = allJokes[Math.floor(Math.random() * allJokes.length)];
  } else {
    const typeJokes = jokes[type as keyof typeof jokes] || jokes.dad;
    joke = typeJokes[Math.floor(Math.random() * typeJokes.length)];
  }

  const embed = new EmbedBuilder()
    .setTitle('😂 Random Joke')
    .setDescription(joke)
    .setColor('#f39c12')
    .setFooter({ text: `Category: ${type}` })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

async function handleMeme(interaction: ChatInputCommandInteraction) {
  const template = interaction.options.getString('template') || 'random';
  const topText = interaction.options.getString('top_text');
  const bottomText = interaction.options.getString('bottom_text');

  const embed = new EmbedBuilder()
    .setTitle('😄 Meme Generator')
    .setDescription('Meme generation is a fun feature! In a real implementation, you would integrate with a meme API or generate images programmatically.')
    .addFields(
      { name: 'Template', value: template, inline: true },
      { name: 'Top Text', value: topText || 'None', inline: true },
      { name: 'Bottom Text', value: bottomText || 'None', inline: true }
    )
    .setColor('#e74c3c')
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

async function handleRiddle(interaction: ChatInputCommandInteraction) {
  const difficulty = interaction.options.getString('difficulty') || 'medium';
  const difficultyRiddles = riddles[difficulty as keyof typeof riddles];
  const riddle = difficultyRiddles[Math.floor(Math.random() * difficultyRiddles.length)];

  const embed = new EmbedBuilder()
    .setTitle(`🧩 Riddle (${difficulty})`)
    .setDescription(riddle.question)
    .setColor('#8e44ad')
    .setFooter({ text: 'Think you know the answer?' })
    .setTimestamp();

  const revealButton = new ButtonBuilder()
    .setCustomId(`riddle_answer:${Buffer.from(riddle.answer).toString('base64')}`)
    .setLabel('Reveal Answer')
    .setEmoji('💡')
    .setStyle(ButtonStyle.Secondary);

  const hintButton = new ButtonBuilder()
    .setCustomId(`riddle_hint:${Buffer.from(riddle.hint).toString('base64')}`)
    .setLabel('Get Hint')
    .setEmoji('❓')
    .setStyle(ButtonStyle.Primary);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(hintButton, revealButton);

  await interaction.reply({ embeds: [embed], components: [row] });
}

async function handleChoose(interaction: ChatInputCommandInteraction) {
  const optionsStr = interaction.options.getString('options', true);
  const options = optionsStr.split(',').map(opt => opt.trim()).filter(opt => opt.length > 0);

  if (options.length < 2) {
    await interaction.reply({
      content: 'Please provide at least 2 options separated by commas!',
      ephemeral: true
    });
    return;
  }

  const choice = options[Math.floor(Math.random() * options.length)];

  const embed = new EmbedBuilder()
    .setTitle('🤔 Decision Maker')
    .addFields(
      { name: 'Options', value: options.join(', '), inline: false },
      { name: '✨ My Choice', value: `**${choice}**`, inline: false }
    )
    .setColor('#3498db')
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

async function handleSlots(interaction: ChatInputCommandInteraction) {
  const bet = interaction.options.getInteger('bet') || 10;
  
  const symbols = ['🍒', '🍋', '🍊', '🍇', '⭐', '💎', '7️⃣'];
  const slots = [
    symbols[Math.floor(Math.random() * symbols.length)],
    symbols[Math.floor(Math.random() * symbols.length)],
    symbols[Math.floor(Math.random() * symbols.length)]
  ];

  let winnings = 0;
  let result = '';

  if (slots[0] === slots[1] && slots[1] === slots[2]) {
    if (slots[0] === '💎') {
      winnings = bet * 10;
      result = 'JACKPOT! 💎💎💎';
    } else if (slots[0] === '7️⃣') {
      winnings = bet * 7;
      result = 'Lucky Sevens! 🍀';
    } else {
      winnings = bet * 3;
      result = 'Triple Match! 🎉';
    }
  } else if (slots[0] === slots[1] || slots[1] === slots[2] || slots[0] === slots[2]) {
    winnings = bet;
    result = 'Pair! You break even 😐';
  } else {
    result = 'No match... Better luck next time! 😞';
  }

  const embed = new EmbedBuilder()
    .setTitle('🎰 Slot Machine')
    .setDescription(`**${slots.join(' | ')}**`)
    .addFields(
      { name: 'Bet', value: `${bet} coins`, inline: true },
      { name: 'Result', value: result, inline: true },
      { name: 'Winnings', value: `${winnings} coins`, inline: true }
    )
    .setColor(winnings > bet ? '#2ecc71' : winnings === bet ? '#f39c12' : '#e74c3c')
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });

  await prisma.gameStats.upsert({
    where: {
      userId_guildId_game: {
        userId: interaction.user.id,
        guildId: interaction.guild!.id,
        game: 'slots'
      }
    },
    update: {
      gamesPlayed: { increment: 1 },
      gamesWon: winnings > 0 ? { increment: 1 } : undefined,
      totalWinnings: { increment: winnings - bet }
    },
    create: {
      userId: interaction.user.id,
      guildId: interaction.guild!.id,
      game: 'slots',
      gamesPlayed: 1,
      gamesWon: winnings > 0 ? 1 : 0,
      totalWinnings: winnings - bet
    }
  });
}