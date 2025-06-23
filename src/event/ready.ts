import { Client, Events, ActivityType } from 'discord.js';

export const name = Events.ClientReady;
export const once = true;

export async function execute(client: Client) {
  if (!client.user) return;
  
  console.log(`🤖 ${client.user.tag} is now online!`);
  console.log(`📊 Serving ${client.guilds.cache.size} servers`);
  console.log(`👥 Watching ${client.users.cache.size} users`);
  
  // Set bot presence
  client.user.setPresence({
    activities: [{
      name: 'XP levels | /help',
      type: ActivityType.Watching
    }],
    status: 'online'
  });

  // Log guild information
  client.guilds.cache.forEach(guild => {
    console.log(`📋 Connected to: ${guild.name} (${guild.id}) - ${guild.memberCount} members`);
  });

  // Update guild count every 30 minutes
  setInterval(() => {
    if (client.user) {
      client.user.setPresence({
        activities: [{
          name: `${client.guilds.cache.size} servers | /help`,
          type: ActivityType.Watching
        }],
        status: 'online'
      });
    }
  }, 30 * 60 * 1000); // 30 minutes
}