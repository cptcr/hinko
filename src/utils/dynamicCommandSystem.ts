import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionResolvable, Collection } from 'discord.js';
import { ExtendedClient, Command } from '../types';
import { performanceManager } from './performanceManager';
import { db } from './optimizedDatabase';
import { EventEmitter } from 'events';

interface GuildCommandConfig {
  guildId: string;
  enabled: boolean;
  cooldown?: number;
  permissions?: PermissionResolvable[];
  aliases?: string[];
  customOptions?: any;
  rateLimit?: { requests: number; windowMs: number };
}

interface DynamicCommand extends Command {
  guildConfigs: Map<string, GuildCommandConfig>;
  middleware?: Array<(interaction: ChatInputCommandInteraction) => Promise<boolean>>;
  ratelimit?: { global: number; perUser: number; perGuild: number };
  priority?: number;
}

interface CommandModule {
  commands: Collection<string, DynamicCommand>;
  events: Map<string, Function>;
  onLoad?: () => Promise<void>;
  onUnload?: () => Promise<void>;
}

export class DynamicCommandSystem extends EventEmitter {
  private client: ExtendedClient;
  private modules = new Map<string, CommandModule>();
  private commandQueue = new Map<string, Array<{ interaction: ChatInputCommandInteraction; timestamp: number }>>();
  private globalRateLimits = new Map<string, number>();

  constructor(client: ExtendedClient) {
    super();
    this.client = client;
    this.startQueueProcessor();
    this.startRateLimitCleanup();
  }

  async loadModule(moduleName: string, modulePath: string): Promise<void> {
    try {
      delete require.cache[require.resolve(modulePath)];
      const moduleExports = await import(modulePath);
      
      const module: CommandModule = {
        commands: new Collection(),
        events: new Map()
      };

      if (moduleExports.default && typeof moduleExports.default === 'object') {
        Object.assign(module, moduleExports.default);
      }

      if (moduleExports.commands) {
        for (const [name, command] of Object.entries(moduleExports.commands)) {
          const dynamicCommand = command as DynamicCommand;
          dynamicCommand.guildConfigs = new Map();
          
          await this.loadGuildConfigs(name, dynamicCommand);
          module.commands.set(name, dynamicCommand);
          this.client.commands.set(name, dynamicCommand);
        }
      }

      if (moduleExports.events) {
        for (const [eventName, handler] of Object.entries(moduleExports.events)) {
          module.events.set(eventName, handler as Function);
          this.client.on(eventName, handler as Function);
        }
      }

      if (module.onLoad) {
        await module.onLoad();
      }

      this.modules.set(moduleName, module);
      this.emit('moduleLoaded', moduleName);
      
      console.log(`✅ Loaded module: ${moduleName} (${module.commands.size} commands)`);
    } catch (error) {
      console.error(`❌ Failed to load module ${moduleName}:`, error);
      throw error;
    }
  }

  async unloadModule(moduleName: string): Promise<void> {
    const module = this.modules.get(moduleName);
    if (!module) return;

    try {
      if (module.onUnload) {
        await module.onUnload();
      }

      for (const [commandName] of module.commands) {
        this.client.commands.delete(commandName);
      }

      for (const [eventName, handler] of module.events) {
        this.client.removeListener(eventName, handler);
      }

      this.modules.delete(moduleName);
      this.emit('moduleUnloaded', moduleName);
      
      console.log(`🗑️ Unloaded module: ${moduleName}`);
    } catch (error) {
      console.error(`❌ Failed to unload module ${moduleName}:`, error);
      throw error;
    }
  }

  async reloadModule(moduleName: string): Promise<void> {
    const modulePath = this.getModulePath(moduleName);
    await this.unloadModule(moduleName);
    await this.loadModule(moduleName, modulePath);
  }

  async configureGuildCommand(
    guildId: string,
    commandName: string,
    config: Partial<GuildCommandConfig>
  ): Promise<void> {
    const command = this.client.commands.get(commandName) as DynamicCommand;
    if (!command) throw new Error(`Command ${commandName} not found`);

    const existingConfig = command.guildConfigs.get(guildId) || {
      guildId,
      enabled: true
    };

    const newConfig = { ...existingConfig, ...config };
    command.guildConfigs.set(guildId, newConfig);

    await db.query('saveGuildCommandConfig', async (client) => {
      return client.guildCommandConfig.upsert({
        where: {
          guildId_commandName: {
            guildId,
            commandName
          }
        },
        update: {
          config: JSON.stringify(newConfig)
        },
        create: {
          guildId,
          commandName,
          config: JSON.stringify(newConfig)
        }
      });
    }, { cache: { key: `guild-cmd-${guildId}-${commandName}`, ttl: 600000 } });

    this.emit('guildCommandConfigured', guildId, commandName, newConfig);
  }

  async executeCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    const commandName = interaction.commandName;
    const command = this.client.commands.get(commandName) as DynamicCommand;
    
    if (!command) return;

    const guildId = interaction.guild?.id;
    if (!guildId) return;

    try {
      const canExecute = await this.checkCommandPermissions(interaction, command);
      if (!canExecute) return;

      const queueKey = `${guildId}-${commandName}`;
      if (command.priority && command.priority > 5) {
        await this.addToQueue(interaction, queueKey);
      } else {
        await this.executeCommandDirect(interaction, command);
      }
    } catch (error) {
      console.error(`Error executing command ${commandName}:`, error);
      await this.handleCommandError(interaction, error);
    }
  }

  private async checkCommandPermissions(
    interaction: ChatInputCommandInteraction,
    command: DynamicCommand
  ): Promise<boolean> {
    const guildId = interaction.guild!.id;
    const userId = interaction.user.id;
    
    const guildConfig = command.guildConfigs.get(guildId);
    if (guildConfig && !guildConfig.enabled) {
      await interaction.reply({
        content: 'This command is disabled in this server.',
        ephemeral: true
      });
      return false;
    }

    if (!performanceManager.checkRateLimit(`user-${userId}`, 10, 60000)) {
      await interaction.reply({
        content: 'You are being rate limited. Please slow down.',
        ephemeral: true
      });
      return false;
    }

    if (guildConfig?.rateLimit) {
      const rateLimitKey = `guild-cmd-${guildId}-${command.data.name}`;
      if (!performanceManager.checkRateLimit(rateLimitKey, guildConfig.rateLimit.requests, guildConfig.rateLimit.windowMs)) {
        await interaction.reply({
          content: 'Command rate limit exceeded for this server.',
          ephemeral: true
        });
        return false;
      }
    }

    if (command.middleware) {
      for (const middleware of command.middleware) {
        const result = await middleware(interaction);
        if (!result) return false;
      }
    }

    return true;
  }

  private async addToQueue(interaction: ChatInputCommandInteraction, queueKey: string): Promise<void> {
    const queue = this.commandQueue.get(queueKey) || [];
    queue.push({ interaction, timestamp: Date.now() });
    
    if (queue.length > 50) {
      const oldest = queue.shift();
      if (oldest && !oldest.interaction.replied) {
        await oldest.interaction.reply({
          content: 'Command queue is full. Please try again later.',
          ephemeral: true
        });
      }
    }
    
    this.commandQueue.set(queueKey, queue);
  }

  private async executeCommandDirect(
    interaction: ChatInputCommandInteraction,
    command: DynamicCommand
  ): Promise<void> {
    await performanceManager.measureCommandExecution(command.data.name, async () => {
      await command.execute(interaction);
    });
  }

  private async loadGuildConfigs(commandName: string, command: DynamicCommand): Promise<void> {
    const configs = await db.query('getGuildCommandConfigs', async (client) => {
      return client.guildCommandConfig.findMany({
        where: { commandName }
      });
    }, { 
      readOnly: true,
      cache: { key: `guild-configs-${commandName}`, ttl: 600000 }
    });

    for (const config of configs) {
      try {
        const parsedConfig = JSON.parse(config.config);
        command.guildConfigs.set(config.guildId, parsedConfig);
      } catch (error) {
        console.error(`Failed to parse config for ${commandName} in guild ${config.guildId}`);
      }
    }
  }

  private startQueueProcessor(): void {
    setInterval(async () => {
      for (const [queueKey, queue] of this.commandQueue) {
        if (queue.length === 0) continue;

        const item = queue.shift();
        if (!item) continue;

        if (Date.now() - item.timestamp > 30000) {
          if (!item.interaction.replied) {
            await item.interaction.reply({
              content: 'Command timed out.',
              ephemeral: true
            });
          }
          continue;
        }

        const command = this.client.commands.get(item.interaction.commandName) as DynamicCommand;
        if (command) {
          try {
            await this.executeCommandDirect(item.interaction, command);
          } catch (error) {
            await this.handleCommandError(item.interaction, error);
          }
        }
      }
    }, 100);
  }

  private startRateLimitCleanup(): void {
    setInterval(() => {
      const now = Date.now();
      for (const [key, timestamp] of this.globalRateLimits) {
        if (now - timestamp > 300000) {
          this.globalRateLimits.delete(key);
        }
      }
    }, 60000);
  }

  private async handleCommandError(interaction: ChatInputCommandInteraction, error: any): Promise<void> {
    console.error('Command execution error:', error);
    
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'An error occurred while executing this command.',
        ephemeral: true
      });
    }
  }

  private getModulePath(moduleName: string): string {
    return `../modules/${moduleName}`;
  }

  getLoadedModules(): string[] {
    return Array.from(this.modules.keys());
  }

  getModuleCommands(moduleName: string): Collection<string, DynamicCommand> | undefined {
    return this.modules.get(moduleName)?.commands;
  }

  async getGuildCommandStats(guildId: string): Promise<any> {
    const commands = Array.from(this.client.commands.values()) as DynamicCommand[];
    const stats = {
      total: commands.length,
      enabled: 0,
      disabled: 0,
      customized: 0
    };

    for (const command of commands) {
      const config = command.guildConfigs.get(guildId);
      if (!config || config.enabled) {
        stats.enabled++;
      } else {
        stats.disabled++;
      }
      
      if (config && Object.keys(config).length > 2) {
        stats.customized++;
      }
    }

    return stats;
  }
}

export const createDynamicCommandSystem = (client: ExtendedClient) => new DynamicCommandSystem(client);