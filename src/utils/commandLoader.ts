import { ExtendedClient, Command } from '../types';
import * as fs from 'fs';
import * as path from 'path';

export async function loadCommands(client: ExtendedClient) {
  const commandsPath = path.join(__dirname, '../commands');
  
  // Check if commands directory exists
  if (!fs.existsSync(commandsPath)) {
    console.warn('⚠️  Commands directory not found, creating it...');
    fs.mkdirSync(commandsPath, { recursive: true });
    return;
  }

  const commandFolders = fs.readdirSync(commandsPath);
  let loadedCommands = 0;

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
        const commandData: Command = command.default || command;

        if ('data' in commandData && 'execute' in commandData) {
          // Set category based on folder name
          commandData.category = folder;
          
          client.commands.set(commandData.data.name, commandData);
          loadedCommands++;
          
          console.log(`✅ Loaded command: ${commandData.data.name} (${folder})`);
        } else {
          console.warn(`⚠️  Command at ${filePath} is missing required "data" or "execute" property`);
        }
      } catch (error) {
        console.error(`❌ Error loading command ${file}:`, error);
      }
    }
  }

  console.log(`✅ Successfully loaded ${loadedCommands} commands`);
}

export function getCommandsByCategory(client: ExtendedClient) {
  const categories = new Map<string, Command[]>();

  client.commands.forEach((command: Command) => {
    const category = command.category || 'general';
    
    if (!categories.has(category)) {
      categories.set(category, []);
    }
    
    categories.get(category)!.push(command);
  });

  return categories;
}

export function getAllCommands(client: ExtendedClient) {
  return Array.from(client.commands.values());
}

export function getCommand(client: ExtendedClient, name: string) {
  return client.commands.get(name);
}

export function hasPermission(command: Command, memberPermissions: any): boolean {
  if (!command.permissions || command.permissions.length === 0) {
    return true;
  }

  // Check if memberPermissions is a PermissionsBitField
  if (typeof memberPermissions === 'string') {
    return false;
  }

  return command.permissions.every((permission: any) => 
    memberPermissions.has(permission)
  );
}

export function isAdminCommand(command: Command): boolean {
  return command.adminOnly === true || command.category === 'admin';
}