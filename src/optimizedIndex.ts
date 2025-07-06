import { Client, GatewayIntentBits, Collection, Partials, Options } from 'discord.js';
import { ExtendedClient, Command } from './types';
import { performanceManager } from './utils/performanceManager';
import { optimizedDatabase, db } from './utils/optimizedDatabase';
import { createDynamicCommandSystem } from './utils/dynamicCommandSystem';
import { securityFramework } from './utils/securityFramework';
import { optimizedXPSystem } from './utils/optimizedXpSystem';
import { createClusteredEventHandler } from './utils/clusteredEventHandler';
import { initializeI18n } from './utils/i18n';
import * as dotenv from 'dotenv';
import * as cluster from 'cluster';
import * as os from 'os';

dotenv.config();

const IS_MASTER = cluster.isPrimary;
const WORKER_COUNT = parseInt(process.env.WORKER_COUNT || '0') || Math.min(4, os.cpus().length);

class OptimizedPegasusBot {
  private client: ExtendedClient;
  private commandSystem: any;
  private eventHandler: any;
  private startTime: number;

  constructor() {
    this.startTime = Date.now();
    this.client = this.createOptimizedClient();
    this.setupGracefulShutdown();
  }

  private createOptimizedClient(): ExtendedClient {
    const client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildModeration,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildMessageReactions
      ],
      partials: [
        Partials.Message,
        Partials.Channel,
        Partials.Reaction,
        Partials.GuildMember,
        Partials.User
      ],
      makeCache: Options.cacheWithLimits({
        MessageManager: {
          maxSize: 200,
          keepOverLimit: (message) => message.pinned,
        },
        GuildMemberManager: {
          maxSize: 200,
          keepOverLimit: (member) => member.id === member.client.user?.id,
        },
        UserManager: {
          maxSize: 500,
          keepOverLimit: (user) => user.bot === false,
        },
        PresenceManager: 0,
        BaseGuildEmojiManager: 0,
        GuildBanManager: 0,
        GuildInviteManager: 0,
        GuildScheduledEventManager: 0,
        GuildStickerManager: 0,
        StageInstanceManager: 0,
        ThreadManager: 0,
        ThreadMemberManager: 0,
        VoiceStateManager: 0
      }),
      allowedMentions: {
        parse: ['users', 'roles'],
        repliedUser: false
      },
      rest: {
        timeout: 30000,
        retries: 3,
        globalRequestsPerSecond: 50,
        api: 'https://discord.com/api'
      },
      ws: {
        compress: true,
        properties: {
          browser: 'Discord.js',
          device: 'PegasusBot',
          os: process.platform
        }
      }
    }) as ExtendedClient;

    client.commands = new Collection<string, Command>();
    return client;
  }

  async initialize(): Promise<void> {
    try {
      console.log('🚀 Initializing Optimized Pegasus Bot...');
      
      console.log('📊 Connecting to optimized database...');
      await this.initializeDatabase();
      
      console.log('🌍 Setting up multi-language support...');
      await initializeI18n();
      
      console.log('🔧 Setting up performance monitoring...');
      this.setupPerformanceMonitoring();
      
      console.log('🔐 Initializing security framework...');
      await this.initializeSecurity();
      
      console.log('⚡ Loading dynamic command system...');
      await this.setupCommandSystem();
      
      console.log('🎯 Setting up clustered event handling...');
      await this.setupEventHandling();
      
      console.log('📈 Starting XP system...');
      this.setupXPSystem();
      
      console.log('⏰ Starting background tasks...');
      this.startBackgroundTasks();
      
      console.log('🔐 Logging in to Discord...');
      await this.client.login(process.env.DISCORD_TOKEN);
      
    } catch (error) {
      console.error('❌ Initialization failed:', error);
      process.exit(1);
    }
  }

  private async initializeDatabase(): Promise<void> {
    const healthCheck = await db.getHealthCheck();
    if (healthCheck.status === 'unhealthy') {
      throw new Error('Database health check failed');
    }
    console.log(`✅ Database connected (${healthCheck.connections} connections, ${healthCheck.avgQueryTime.toFixed(2)}ms avg)`);
  }

  private setupPerformanceMonitoring(): void {
    performanceManager.on('metrics', (metrics) => {
      if (metrics.memoryUsage > 1024 * 1024 * 1024) { // 1GB
        console.warn('⚠️ High memory usage detected:', (metrics.memoryUsage / 1024 / 1024).toFixed(2), 'MB');
      }
    });

    performanceManager.on('error', (errorData) => {
      console.error('🔥 Performance error:', errorData);
    });

    setInterval(() => {
      if (global.gc) {
        global.gc();
      }
    }, 300000); // Run garbage collection every 5 minutes
  }

  private async initializeSecurity(): Promise<void> {
    this.client.on('interactionCreate', async (interaction) => {
      if (!interaction.isChatInputCommand()) return;

      const start = performance.now();
      const validation = await securityFramework.validateCommand(interaction);
      const validationTime = performance.now() - start;

      if (validationTime > 100) {
        console.warn(`⚠️ Slow security validation: ${validationTime.toFixed(2)}ms for ${interaction.commandName}`);
      }

      if (!validation.allowed) {
        if (validation.incident) {
          console.warn(`🚨 Security incident: ${validation.incident.type} - ${validation.incident.userId}`);
        }
        
        if (!interaction.replied) {
          await interaction.reply({
            content: validation.reason || 'Command not allowed',
            ephemeral: true
          });
        }
      }
    });
  }

  private async setupCommandSystem(): Promise<void> {
    this.commandSystem = createDynamicCommandSystem(this.client);
    
    const moduleDirectories = ['general', 'level', 'admin', 'moderation'];
    
    for (const dir of moduleDirectories) {
      try {
        await this.commandSystem.loadModule(dir, `./commands/${dir}`);
      } catch (error) {
        console.error(`Failed to load module ${dir}:`, error);
      }
    }

    this.commandSystem.on('moduleLoaded', (moduleName: string) => {
      console.log(`📦 Module loaded: ${moduleName}`);
    });

    this.commandSystem.on('guildCommandConfigured', (guildId: string, commandName: string, config: any) => {
      db.invalidateCache([`guild-cmd-${guildId}`]);
    });
  }

  private async setupEventHandling(): Promise<void> {
    this.eventHandler = createClusteredEventHandler(this.client);
    
    this.eventHandler.on('eventProcessed', (eventData: any, result: any) => {
      if (eventData.priority === 'critical') {
        console.log(`⚡ Critical event processed: ${eventData.type}`);
      }
    });

    this.eventHandler.on('eventFailed', (eventData: any, error: Error) => {
      console.error(`❌ Event failed: ${eventData.type}`, error);
    });

    this.eventHandler.on('metrics', (metrics: any) => {
      if (metrics.totalQueued > 1000) {
        console.warn(`⚠️ High event queue: ${metrics.totalQueued} events`);
      }
    });
  }

  private setupXPSystem(): void {
    optimizedXPSystem.on('levelUp', async (data: any) => {
      const { userId, guildId, newLevel } = data;
      
      try {
        const guild = this.client.guilds.cache.get(guildId);
        if (!guild) return;

        const member = await guild.members.fetch(userId);
        if (!member) return;

        console.log(`🎉 ${member.user.username} reached level ${newLevel} in ${guild.name}`);
        
        const channel = guild.systemChannel || guild.channels.cache.find(c => c.name.includes('general'));
        if (channel && 'send' in channel) {
          await channel.send({
            content: `🎉 Congratulations ${member}! You've reached **Level ${newLevel}**!`
          });
        }
      } catch (error) {
        console.error('Error handling level up:', error);
      }
    });

    optimizedXPSystem.on('multiplierSet', (guildId: string, multiplier: any) => {
      console.log(`✨ XP multiplier set in guild ${guildId}: ${multiplier.type} x${multiplier.multiplier}`);
    });
  }

  private startBackgroundTasks(): void {
    setInterval(async () => {
      try {
        const metrics = performanceManager.getMetricsSnapshot();
        const dbHealth = await db.getHealthCheck();
        const xpMetrics = await optimizedXPSystem.getSystemMetrics();
        
        const status = {
          uptime: Date.now() - this.startTime,
          guilds: this.client.guilds.cache.size,
          users: this.client.users.cache.size,
          performance: metrics,
          database: dbHealth,
          xpSystem: xpMetrics,
          memory: process.memoryUsage(),
          cpu: process.cpuUsage()
        };

        performanceManager.setCache('bot-status', status, 60000);
        
        if (dbHealth.status === 'unhealthy') {
          console.error('🔥 Database is unhealthy!');
        }
      } catch (error) {
        console.error('Error in background task:', error);
      }
    }, 30000);

    setInterval(async () => {
      try {
        const expiredBans = await db.query('cleanupExpiredBans', async (client) => {
          return client.securityBan.deleteMany({
            where: {
              expiresAt: {
                not: null,
                lt: new Date()
              }
            }
          });
        });

        if (expiredBans.count > 0) {
          console.log(`🧹 Cleaned up ${expiredBans.count} expired security bans`);
        }
      } catch (error) {
        console.error('Error cleaning up expired bans:', error);
      }
    }, 3600000); // Every hour
  }

  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      console.log(`🛑 Received ${signal}, shutting down gracefully...`);
      
      try {
        if (this.eventHandler) {
          await this.eventHandler.gracefulShutdown();
        }
        
        if (optimizedXPSystem) {
          optimizedXPSystem.destroy();
        }
        
        await this.client.destroy();
        
        if (optimizedDatabase) {
          await optimizedDatabase.disconnect();
        }
        
        console.log('✅ Graceful shutdown complete');
        process.exit(0);
      } catch (error) {
        console.error('❌ Error during shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    
    process.on('unhandledRejection', (error) => {
      console.error('Unhandled promise rejection:', error);
    });

    process.on('uncaughtException', (error) => {
      console.error('Uncaught exception:', error);
      shutdown('UNCAUGHT_EXCEPTION');
    });
  }

  private setupReadyHandler(): void {
    this.client.once('ready', () => {
      if (!this.client.user) return;
      
      const bootTime = Date.now() - this.startTime;
      
      console.log(`🤖 ${this.client.user.tag} is now online!`);
      console.log(`⚡ Boot time: ${bootTime}ms`);
      console.log(`📊 Serving ${this.client.guilds.cache.size} servers`);
      console.log(`👥 Watching ${this.client.users.cache.size} users`);
      console.log(`🔧 Worker process: ${process.pid}`);
      
      this.client.user.setPresence({
        activities: [{
          name: `${this.client.guilds.cache.size} servers | Ultra-fast performance`,
          type: 3 // Watching
        }],
        status: 'online'
      });

      this.startStatusUpdates();
    });
  }

  private startStatusUpdates(): void {
    setInterval(() => {
      if (!this.client.user) return;
      
      const metrics = performanceManager.getMetricsSnapshot();
      const avgCommandTime = Object.values(metrics.averageCommandTime || {}).reduce((sum: number, time: number) => sum + time, 0) / Object.keys(metrics.averageCommandTime || {}).length || 0;
      
      this.client.user.setPresence({
        activities: [{
          name: `${this.client.guilds.cache.size} servers | ${avgCommandTime.toFixed(1)}ms avg response`,
          type: 3 // Watching
        }],
        status: 'online'
      });
    }, 300000); // Update every 5 minutes
  }

  async start(): Promise<void> {
    this.setupReadyHandler();
    await this.initialize();
  }
}

async function startClusteredBot(): Promise<void> {
  if (IS_MASTER && WORKER_COUNT > 1) {
    console.log(`🔄 Starting ${WORKER_COUNT} worker processes...`);
    
    for (let i = 0; i < WORKER_COUNT; i++) {
      const worker = cluster.fork();
      console.log(`🔧 Worker ${worker.process.pid} started`);
    }

    cluster.on('exit', (worker, code, signal) => {
      console.log(`💀 Worker ${worker.process.pid} died (${signal || code}). Restarting...`);
      cluster.fork();
    });

    cluster.on('online', (worker) => {
      console.log(`✅ Worker ${worker.process.pid} is online`);
    });

  } else {
    const bot = new OptimizedPegasusBot();
    await bot.start();
  }
}

if (require.main === module) {
  startClusteredBot().catch(console.error);
}

export { OptimizedPegasusBot };