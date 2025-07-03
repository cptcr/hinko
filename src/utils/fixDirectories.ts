import * as fs from 'fs';
import * as path from 'path';

export function ensureDirectoryStructure() {
  const directories = [
    'src/commands',
    'src/commands/admin',
    'src/commands/general',
    'src/commands/level',
    'src/commands/moderation',
    'src/events',
    'src/interactions',
    'src/utils',
    'locales'
  ];

  directories.forEach(dir => {
    const fullPath = path.join(process.cwd(), dir);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
      console.log(`✅ Created directory: ${dir}`);
    }
  });

  const eventPath = path.join(process.cwd(), 'src/event');
  const eventsPath = path.join(process.cwd(), 'src/events');
  
  if (fs.existsSync(eventPath) && !fs.existsSync(eventsPath)) {
    fs.renameSync(eventPath, eventsPath);
    console.log('✅ Renamed event directory to events');
  }

  const ticketHandlerPath = path.join(process.cwd(), 'src/interactions/ticketButtons.ts');
  if (!fs.existsSync(ticketHandlerPath)) {
    console.log('⚠️  Missing ticketButtons.ts - run setup to generate all files');
  }

  const pollHandlerPath = path.join(process.cwd(), 'src/interactions/pollButtons.ts');
  if (!fs.existsSync(pollHandlerPath)) {
    console.log('⚠️  Missing pollButtons.ts - run setup to generate all files');
  }
}