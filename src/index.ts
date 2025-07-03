import { Client, GatewayIntentBits, Collection } from 'discord.js';
import { ExtendedClient, Command } from './types';
import { loadCommands } from './utils/commandLoader';
import { loadEvents } from './utils/eventLoader';
import { initializeDatabase } from './utils/database';
import { initializeI18n } from './utils/i18n';
import { startMonthlyResetCron } from './utils/cronJobs';
import { startModerationCron } from './utils/moderationSystem';
import { startBirthdayCron } from './utils/birthdaySystem';
import * as dotenv from 'dotenv';

dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildModeration
  ]
}) as ExtendedClient;

client.commands = new Collection<string, Command>();

async function startBot() {
  try {
    console.log('🚀 Starting Pegasus Discord Bot...');
    
    console.log('📊 Connecting to database...');
    await initializeDatabase();
    
    console.log('🌍 Setting up multi-language support...');
    await initializeI18n();
    
    console.log('⚡ Loading commands...');
    await loadCommands(client);
    
    console.log('🎯 Loading events...');
    await loadEvents(client);
    
    console.log('⏰ Starting scheduled tasks...');
    startMonthlyResetCron();
    startModerationCron();
    startBirthdayCron(client);
    
    console.log('🔐 Logging in to Discord...');
    await client.login(process.env.DISCORD_TOKEN);
    
  } catch (error) {
    console.error('❌ Error starting bot:', error);
    process.exit(1);
  }
}

process.on('unhandledRejection', (error) => {
  console.error('Unhandled promise rejection:', error);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  process.exit(1);
});

process.on('SIGINT', async () => {
  console.log('🛑 Received SIGINT, shutting down gracefully...');
  await client.destroy();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('🛑 Received SIGTERM, shutting down gracefully...');
  await client.destroy();
  process.exit(0);
});

startBot();