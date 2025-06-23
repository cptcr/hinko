import { REST, Routes } from 'discord.js';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

const commands: any[] = [];

// Load all commands
const commandsPath = path.join(__dirname, 'commands');

async function loadCommands() {
  // Check if commands directory exists
  if (!fs.existsSync(commandsPath)) {
    console.error('❌ Commands directory not found');
    process.exit(1);
  }

  const commandFolders = fs.readdirSync(commandsPath);

  for (const folder of commandFolders) {
    const folderPath = path.join(commandsPath, folder);
    
    if (!fs.statSync(folderPath).isDirectory()) continue;

    const commandFiles = fs.readdirSync(folderPath).filter((file: string) => 
      file.endsWith('.ts') || file.endsWith('.js')
    );

    for (const file of commandFiles) {
      const filePath = path.join(folderPath, file);
      
      try {
        const command = await import(filePath);
        const commandData = command.default || command;

        if ('data' in commandData && 'execute' in commandData) {
          commands.push(commandData.data.toJSON());
          console.log(`✅ Loaded command: ${commandData.data.name}`);
        } else {
          console.warn(`⚠️  Command at ${filePath} is missing required "data" or "execute" property`);
        }
      } catch (error) {
        console.error(`❌ Error loading command ${file}:`, error);
      }
    }
  }
}

async function deployCommands() {
  const token = process.env.DISCORD_TOKEN;
  const clientId = process.env.CLIENT_ID;
  const guildId = process.env.GUILD_ID;

  if (!token || !clientId) {
    console.error('❌ Missing DISCORD_TOKEN or CLIENT_ID in environment variables');
    process.exit(1);
  }

  console.log('🚀 Loading commands...');
  await loadCommands();

  console.log(`📝 Found ${commands.length} commands to deploy`);

  // Construct and prepare an instance of the REST module
  const rest = new REST({ version: '10' }).setToken(token);

  try {
    console.log('🔄 Started refreshing application (/) commands...');

    let data: any;

    if (guildId) {
      // Deploy to specific guild (for testing)
      console.log(`🎯 Deploying to guild: ${guildId}`);
      data = await rest.put(
        Routes.applicationGuildCommands(clientId, guildId),
        { body: commands }
      );
    } else {
      // Deploy globally
      console.log('🌍 Deploying globally...');
      data = await rest.put(
        Routes.applicationCommands(clientId),
        { body: commands }
      );
    }

    console.log(`✅ Successfully reloaded ${data.length} application (/) commands`);
    
    // List deployed commands
    console.log('\n📋 Deployed commands:');
    data.forEach((cmd: any) => {
      console.log(`   • /${cmd.name} - ${cmd.description}`);
    });

  } catch (error) {
    console.error('❌ Error deploying commands:', error);
    process.exit(1);
  }
}

// Handle command line arguments
const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
🤖 Pegasus Discord Bot - Command Deployment

Usage:
  npm run deploy              Deploy to guild (if GUILD_ID is set) or globally
  npm run deploy -- --global Deploy globally (ignores GUILD_ID)
  npm run deploy -- --guild  Deploy to guild only (requires GUILD_ID)

Environment Variables:
  DISCORD_TOKEN  - Your bot token (required)
  CLIENT_ID      - Your bot's client ID (required)
  GUILD_ID       - Guild ID for testing (optional)

Examples:
  npm run deploy                    # Deploy based on GUILD_ID setting
  npm run deploy -- --global       # Force global deployment
  npm run deploy -- --guild        # Force guild deployment
  `);
  process.exit(0);
}

// Handle deployment options
if (args.includes('--global')) {
  delete process.env.GUILD_ID;
  console.log('🌍 Forced global deployment');
} else if (args.includes('--guild')) {
  if (!process.env.GUILD_ID) {
    console.error('❌ --guild flag requires GUILD_ID environment variable');
    process.exit(1);
  }
  console.log(`🎯 Forced guild deployment to: ${process.env.GUILD_ID}`);
}

deployCommands().catch(console.error);