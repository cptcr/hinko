import { ExtendedClient, BotEvent } from '../types';
import * as fs from 'fs';
import * as path from 'path';

export async function loadEvents(client: ExtendedClient) {
  const eventsPath = path.join(__dirname, '../events');
  
  // Check if events directory exists
  if (!fs.existsSync(eventsPath)) {
    console.warn('⚠️  Events directory not found, creating it...');
    fs.mkdirSync(eventsPath, { recursive: true });
    return;
  }

  const eventFiles = fs.readdirSync(eventsPath).filter((file: string) => 
    file.endsWith('.ts') || file.endsWith('.js')
  );

  let loadedEvents = 0;

  for (const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    
    try {
      const event = await import(filePath);
      const eventData: BotEvent = event.default || event;

      if ('name' in eventData && 'execute' in eventData) {
        if (eventData.once) {
          client.once(eventData.name, (...args: any[]) => eventData.execute(...args));
        } else {
          client.on(eventData.name, (...args: any[]) => eventData.execute(...args));
        }
        
        loadedEvents++;
        console.log(`✅ Loaded event: ${eventData.name}${eventData.once ? ' (once)' : ''}`);
      } else {
        console.warn(`⚠️  Event at ${filePath} is missing required "name" or "execute" property`);
      }
    } catch (error) {
      console.error(`❌ Error loading event ${file}:`, error);
    }
  }

  console.log(`✅ Successfully loaded ${loadedEvents} events`);
}