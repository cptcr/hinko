const fs = require('fs');
const path = require('path');

console.log('🚀 Setting up Pegasus Discord Bot v2.0...\n');

// Create necessary directories
const directories = [
  'src/commands/admin',
  'src/commands/general',
  'src/commands/level',
  'src/commands/moderation',
  'src/events',
  'src/interactions',
  'src/utils',
  'locales',
  'dist'
];

directories.forEach(dir => {
  const fullPath = path.join(__dirname, dir);
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
    console.log(`✅ Created directory: ${dir}`);
  }
});

// Fix event/events directory
const eventPath = path.join(__dirname, 'src/event');
const eventsPath = path.join(__dirname, 'src/events');

if (fs.existsSync(eventPath) && !fs.existsSync(eventsPath)) {
  fs.renameSync(eventPath, eventsPath);
  console.log('✅ Renamed event directory to events');
} else if (fs.existsSync(eventPath) && fs.existsSync(eventsPath)) {
  // Move files from event to events
  const files = fs.readdirSync(eventPath);
  files.forEach(file => {
    const oldPath = path.join(eventPath, file);
    const newPath = path.join(eventsPath, file);
    if (!fs.existsSync(newPath)) {
      fs.renameSync(oldPath, newPath);
      console.log(`✅ Moved ${file} to events directory`);
    }
  });
  // Remove old event directory
  fs.rmdirSync(eventPath, { recursive: true });
  console.log('✅ Removed old event directory');
}

// Fix pollButtonts.ts naming
const pollButtontsPath = path.join(__dirname, 'src/interactions/pollButtonts.ts');
const pollButtonsPath = path.join(__dirname, 'src/interactions/pollButtons.ts');

if (fs.existsSync(pollButtontsPath) && !fs.existsSync(pollButtonsPath)) {
  fs.renameSync(pollButtontsPath, pollButtonsPath);
  console.log('✅ Fixed pollButtons.ts filename');
}

// Check for .env file
if (!fs.existsSync('.env')) {
  if (fs.existsSync('.env.example')) {
    console.log('\n⚠️  No .env file found!');
    console.log('📝 Please copy .env.example to .env and fill in your credentials:');
    console.log('   cp .env.example .env');
  } else {
    console.log('\n⚠️  No .env file found!');
    console.log('📝 Please create a .env file with the following variables:');
    console.log(`
DISCORD_TOKEN=your_discord_bot_token_here
CLIENT_ID=your_bot_client_id_here
GUILD_ID=your_test_guild_id_here
DATABASE_URL=postgresql://username:password@hostname:port/database?sslmode=require
XP_MIN=15
XP_MAX=25
XP_COOLDOWN=60000
XP_RATE=1.0
`);
  }
} else {
  console.log('✅ Found .env file');
}

console.log('\n📦 Next steps:');
console.log('1. Run: npm install');
console.log('2. Run: npm run db:generate');
console.log('3. Run: npm run db:push');
console.log('4. Run: npm run deploy');
console.log('5. Run: npm run dev');
console.log('\nFor production:');
console.log('- Run: npm run build');
console.log('- Run: npm start');
console.log('\n✨ Setup complete!');