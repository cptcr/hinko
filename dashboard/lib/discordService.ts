// dashboard/lib/discordService.ts
import { Client, GatewayIntentBits, Guild as DiscordJSEntityGuild, GuildChannel, Role as DiscordJSRole, GuildMember, NonThreadGuildBasedChannel, OAuth2Guild } from 'discord.js'; // Renamed to avoid conflict
import { ApiChannel, ApiRole, GuildWithFullStats } from '@/types/index'; // Using shared types

const TARGET_GUILD_ID = process.env.TARGET_GUILD_ID || '554266392262737930'; // Ensure this is set in your environment for the dashboard

// Define a type for the subset of Guild information we need from Discord API
export interface DiscordGuildInfo {
  id: string;
  name: string;
  iconURL: string | null;
  memberCount: number;
  onlineCount?: number; // Approximate presence count
  ownerId: string;
  description: string | null;
  createdAt: Date;
  features: string[];
}


class DiscordService {
  private client: Client;
  private isInitialized = false;
  private currentToken: string | null = null;

  constructor() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        // GatewayIntentBits.GuildMessages, // Likely not needed for dashboard read-only ops
        // GatewayIntentBits.GuildVoiceStates, // If dashboard manages voice
        GatewayIntentBits.GuildPresences, // For online count
      ],
    });
  }

  // Modified initialize to accept a token, or use the bot's token
  async initialize(token?: string): Promise<void> {
    if (this.isInitialized && token && this.currentToken === token) return;
    if (this.isInitialized && !token && this.currentToken === process.env.DISCORD_BOT_TOKEN) return;


    const loginToken = token || process.env.DISCORD_BOT_TOKEN;
    this.currentToken = loginToken;

    try {
      if (!loginToken) {
        console.warn('⚠️ Discord bot token not provided - Discord service cannot fully initialize.');
        this.isInitialized = false; // Mark as not initialized if no token
        return;
      }

      await this.client.login(loginToken);
      this.isInitialized = true;
      console.log('✅ Discord service initialized');

      const targetGuild = await this.getGuild(TARGET_GUILD_ID);
      if (targetGuild) {
        console.log(`✅ Target guild found: ${targetGuild.name} (${targetGuild.memberCount} members)`);
      } else {
        console.warn(`⚠️ Target guild ${TARGET_GUILD_ID} not found - bot may not be in the guild or token lacks permissions.`);
      }
    } catch (error) {
      console.error('❌ Failed to initialize Discord service:', error);
      this.isInitialized = false; // Ensure it's marked as not initialized on error
    }
  }

  async getGuild(guildId: string): Promise<DiscordJSEntityGuild | null> {
    if (!this.isInitialized && this.client.isReady()) { // Check if client is ready even if full init failed due to TARGET_GUILD
      try {
         return await this.client.guilds.fetch(guildId);
      } catch (fetchError) {
        console.error(`Error fetching guild ${guildId} (client ready, init incomplete):`, fetchError);
        return null;
      }
    }
    if (!this.isInitialized || !this.client.isReady()) { // If not ready, can't fetch
        console.warn(`[DiscordService] Attempted to fetch guild ${guildId} but service is not ready or initialized.`);
        return null;
    }
    try {
      return await this.client.guilds.fetch(guildId);
    } catch (error) {
      console.error(`Error fetching guild ${guildId}:`, error);
      return null;
    }
  }

  async getAllGuilds(): Promise<Array<{ id: string; name: string }>> {
    if (!this.isInitialized || !this.client.isReady()) {
        console.warn(`[DiscordService] Attempted to fetch all guilds but service is not ready or initialized.`);
        return [];
    }
    try {
      const guilds = await this.client.guilds.fetch(); // Fetches OAuth2Guild objects
      return guilds.map((guild: OAuth2Guild) => ({ // Explicitly type guild here
        id: guild.id,
        name: guild.name
      }));
    } catch (error) {
      console.error('Error fetching all guilds:', error);
      return [];
    }
  }

  async getGuildChannels(guildId: string): Promise<ApiChannel[]> {
    try {
      const guild = await this.getGuild(guildId);
      if (!guild) return this.getMockChannels(); // Fallback to mock if guild not found

      const channels = await guild.channels.fetch();
      return channels
        .filter((channel): channel is NonThreadGuildBasedChannel => channel !== null && !channel.isThread())
        .map(channel => ({
          id: channel.id,
          name: channel.name,
          type: channel.type,
          parentId: channel.parentId,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
      console.error(`Error fetching channels for guild ${guildId}:`, error);
      return this.getMockChannels();
    }
  }

  async getGuildRoles(guildId: string): Promise<ApiRole[]> {
    try {
      const guild = await this.getGuild(guildId);
      if (!guild) return this.getMockRoles();

      const roles = await guild.roles.fetch();
      return roles
        .filter((role): role is DiscordJSRole => role !== null)
        .map(role => ({
          id: role.id,
          name: role.name,
          color: role.color,
          position: role.position,
          managed: role.managed, // Added managed property
        }))
        .sort((a, b) => b.position - a.position);
    } catch (error) {
      console.error(`Error fetching roles for guild ${guildId}:`, error);
      return this.getMockRoles();
    }
  }

  async getGuildMemberCount(guildId: string): Promise<number> {
    try {
      const guild = await this.getGuild(guildId);
      if (!guild) return 0;
      return guild.memberCount || 0;
    } catch (error) {
      console.error(`Error fetching member count for guild ${guildId}:`, error);
      return 0;
    }
  }

  async getGuildInfo(guildId: string): Promise<DiscordGuildInfo | null> {
    try {
      const guild = await this.getGuild(guildId);
      if (!guild) return this.getMockGuildInfo(guildId);

      // Fetch approximate presence count if available through guild object
      // Note: This might require GatewayIntentBits.GuildPresences
      const onlineCount = guild.presences?.cache.filter(p => p.status !== 'offline').size;


      return {
        id: guild.id,
        name: guild.name,
        iconURL: guild.iconURL(),
        memberCount: guild.memberCount,
        onlineCount: onlineCount,
        ownerId: guild.ownerId,
        description: guild.description,
        createdAt: guild.createdAt,
        features: guild.features,
      };
    } catch (error) {
      console.error(`Error fetching guild info for ${guildId}:`, error);
      return this.getMockGuildInfo(guildId);
    }
  }

  async getGuildMember(guildId: string, userId: string): Promise<GuildMember | null> {
    try {
      const guild = await this.getGuild(guildId);
      if (!guild) return null;
      return await guild.members.fetch(userId);
    } catch (error) {
      // Don't log "Unknown Member" as an error, it's a common case
      if (error instanceof Error && (error.message.includes('Unknown Member') || (error as any).code === 10007) ) {
        // console.debug(`Member ${userId} not found in guild ${guildId}.`);
      } else {
        console.error(`Error fetching member ${userId} in guild ${guildId}:`, error);
      }
      return null;
    }
  }

  async checkUserPermissions(guildId: string, userId: string, requiredRoleId: string): Promise<boolean> {
    try {
      const member = await this.getGuildMember(guildId, userId);
      if (!member) return false;
      return member.roles.cache.has(requiredRoleId);
    } catch (error) {
      console.error(`Error checking permissions for user ${userId}:`, error);
      return false;
    }
  }

  isReady(): boolean {
    return this.client.isReady();
  }

  getClient(): Client {
    return this.client;
  }

  async disconnect(): Promise<void> {
    if (this.client && this.client.isReady()) {
      this.client.destroy();
      this.isInitialized = false;
      this.currentToken = null;
      console.log('🔌 Discord service disconnected');
    }
  }

  // Mock data for when Discord API is not available or for testing
  private getMockChannels(): ApiChannel[] {
    return [
      { id: 'mockChannel1', name: 'general-mock', type: 0, parentId: null },
      { id: 'mockChannel2', name: 'moderator-logs-mock', type: 0, parentId: null },
    ];
  }

  private getMockRoles(): ApiRole[] {
    return [
      { id: 'mockRole1', name: '@everyone-mock', color: 0, position: 0, managed: false },
      { id: 'mockRole2', name: 'Admin-mock', color: 0xff0000, position: 10, managed: false },
    ];
  }

  private getMockGuildInfo(guildId: string): DiscordGuildInfo | null {
    if (guildId === TARGET_GUILD_ID) {
      return {
        id: guildId,
        name: 'Test Server (Mock)',
        iconURL: null,
        memberCount: 150,
        onlineCount: 75,
        ownerId: 'mockOwnerId',
        description: 'A mock Discord server for testing.',
        createdAt: new Date('2020-01-01'),
        features: [],
      };
    }
    return null;
  }

  async healthCheck(): Promise<{ status: 'healthy' | 'unhealthy'; details: Record<string, unknown> }> { // Changed details to Record
    try {
      if (!this.isInitialized || !this.client.isReady()) { // Added !this.client.isReady()
        return {
          status: 'unhealthy',
          details: {
            initialized: this.isInitialized,
            ready: this.client.isReady(),
            message: 'Discord service not initialized or not ready'
          }
        };
      }

      const guild = await this.getGuild(TARGET_GUILD_ID);

      return {
        status: guild ? 'healthy' : 'unhealthy',
        details: {
          initialized: this.isInitialized,
          botReady: this.client.isReady(),
          targetGuildFound: !!guild,
          targetGuildName: guild?.name || 'Not found',
          targetGuildMembers: guild?.memberCount || 0,
          uptime: this.client.uptime,
          timestamp: new Date().toISOString()
        }
      };
    } catch (error: unknown) { // Catch unknown
      return {
        status: 'unhealthy',
        details: {
          error: error instanceof Error ? error.message : 'Unknown error during health check',
          timestamp: new Date().toISOString()
        }
      };
    }
  }

  getBotStatus(): Record<string, unknown> { // Changed return type
    return {
      ready: this.client.isReady(),
      uptime: this.client.uptime,
      ping: this.client.ws.ping,
      guilds: this.client.guilds.cache.size,
      users: this.client.users.cache.size, // This might be low if only a bot token for specific guild is used
      timestamp: new Date().toISOString()
    };
  }

  setupEventListeners(): void { // No async needed if just attaching listeners
    this.client.on('ready', () => {
      console.log(`✅ Discord bot ready as ${this.client.user?.tag}`);
    });

    this.client.on('error', (error: Error) => { // Explicitly type error
      console.error('❌ Discord client error:', error);
    });

    this.client.on('warn', (warning: string) => { // Explicitly type warning
      console.warn('⚠️ Discord client warning:', warning);
    });

    this.client.on('disconnect', () => {
      console.log('🔌 Discord client disconnected');
      this.isInitialized = false; // Reset on disconnect
      this.currentToken = null;
    });

    this.client.on('reconnecting', () => {
      console.log('🔄 Discord client reconnecting...');
    });

    this.client.on('guildCreate', (guild: DiscordJSEntityGuild) => { // Explicitly type guild
      console.log(`➕ Bot added to guild: ${guild.name} (${guild.id})`);
    });

    this.client.on('guildDelete', (guild: DiscordJSEntityGuild) => { // Explicitly type guild
      console.log(`➖ Bot removed from guild: ${guild.name} (${guild.id})`);
    });
  }
}

export const discordService = new DiscordService();