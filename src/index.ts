import { Client, GatewayIntentBits, Collection } from 'discord.js';
import { ExtendedClient, Command } from './types';
import { loadCommands } from './utils/commandLoader';
import { loadEvents } from './utils/eventLoader';
import { initializeDatabase } from './utils/database';
import { initializeI18n } from './utils/i18n';
import { startMonthlyResetCron } from './utils/cronJobs';
import * as dotenv from 'dotenv';

dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates
  ]
}) as ExtendedClient;

client.commands = new Collection<string, Command>();

async function startBot() {
  try {
    console.log('🚀 Starting Pegasus Discord Bot...');
    
    // Initialize database connection
    console.log('📊 Connecting to database...');
    await initializeDatabase();
    
    // Initialize internationalization
    console.log('🌍 Setting up multi-language support...');
    await initializeI18n();
    
    // Load commands
    console.log('⚡ Loading commands...');
    await loadCommands(client);
    
    // Load events
    console.log('🎯 Loading events...');
    await loadEvents(client);
    
    // Start cron jobs for monthly resets
    console.log('⏰ Starting scheduled tasks...');
    startMonthlyResetCron();
    
    // Login to Discord
    console.log('🔐 Logging in to Discord...');
    await client.login(process.env.DISCORD_TOKEN);
    
  } catch (error) {
    console.error('❌ Error starting bot:', error);
    process.exit(1);
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (error) => {
  console.error('Unhandled promise rejection:', error);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  process.exit(1);
});

// Graceful shutdown
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