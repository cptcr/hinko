import { EventEmitter } from 'events';
import { Worker } from 'worker_threads';
import { performance } from 'perf_hooks';
import { ExtendedClient } from '../types';
import { performanceManager } from './performanceManager';
import { securityFramework } from './securityFramework';
import { optimizedXPSystem } from './optimizedXpSystem';

interface EventWorkerData {
  type: string;
  data: any;
  priority: 'low' | 'medium' | 'high' | 'critical';
  timestamp: number;
  retries: number;
}

interface EventQueue {
  critical: EventWorkerData[];
  high: EventWorkerData[];
  medium: EventWorkerData[];
  low: EventWorkerData[];
}

interface WorkerPool {
  workers: Worker[];
  available: boolean[];
  processing: Map<number, EventWorkerData>;
}

export class ClusteredEventHandler extends EventEmitter {
  private client: ExtendedClient;
  private eventQueue: EventQueue;
  private workerPool: WorkerPool;
  private eventBuffer = new Map<string, any[]>();
  private processingStats = new Map<string, { count: number; totalTime: number }>();
  private deadLetterQueue: EventWorkerData[] = [];
  private maxRetries = 3;
  private maxWorkers = 4;

  constructor(client: ExtendedClient) {
    super();
    this.client = client;
    this.eventQueue = {
      critical: [],
      high: [],
      medium: [],
      low: []
    };
    
    this.initializeWorkerPool();
    this.startEventProcessor();
    this.startMetricsCollection();
    this.setupEventHandlers();
  }

  private initializeWorkerPool(): void {
    this.workerPool = {
      workers: [],
      available: [],
      processing: new Map()
    };

    for (let i = 0; i < this.maxWorkers; i++) {
      const worker = new Worker(`
        const { parentPort } = require('worker_threads');
        
        parentPort.on('message', async (eventData) => {
          try {
            const result = await processEvent(eventData);
            parentPort.postMessage({ success: true, result, workerId: ${i} });
          } catch (error) {
            parentPort.postMessage({ 
              success: false, 
              error: error.message, 
              workerId: ${i} 
            });
          }
        });
        
        async function processEvent(eventData) {
          const { type, data } = eventData;
          
          switch (type) {
            case 'xp_calculation':
              return calculateXPBatch(data);
            case 'permission_check':
              return validatePermissions(data);
            case 'security_scan':
              return performSecurityScan(data);
            case 'cache_update':
              return updateCache(data);
            default:
              throw new Error('Unknown event type: ' + type);
          }
        }
        
        function calculateXPBatch(data) {
          const { users, baseXP, multipliers } = data;
          return users.map(user => ({
            userId: user.id,
            xp: Math.floor(baseXP * (multipliers[user.id] || 1))
          }));
        }
        
        function validatePermissions(data) {
          const { userPermissions, requiredPermissions } = data;
          return requiredPermissions.every(perm => userPermissions.includes(perm));
        }
        
        function performSecurityScan(data) {
          const { content } = data;
          const suspiciousPatterns = [
            /eval\\s*\\(/gi,
            /function\\s*\\(/gi,
            /script/gi
          ];
          
          return {
            safe: !suspiciousPatterns.some(pattern => pattern.test(content)),
            detectedPatterns: suspiciousPatterns.filter(pattern => pattern.test(content)).map(p => p.source)
          };
        }
        
        function updateCache(data) {
          return { updated: true, timestamp: Date.now() };
        }
      `, { eval: true });

      worker.on('message', (result) => {
        this.handleWorkerResult(i, result);
      });

      worker.on('error', (error) => {
        console.error(`Worker ${i} error:`, error);
        this.handleWorkerError(i, error);
      });

      this.workerPool.workers.push(worker);
      this.workerPool.available.push(true);
    }
  }

  private setupEventHandlers(): void {
    this.client.on('messageCreate', async (message) => {
      if (message.author.bot || !message.guild) return;

      await this.queueEvent({
        type: 'message_xp',
        data: {
          userId: message.author.id,
          guildId: message.guild.id,
          username: message.author.username,
          content: message.content
        },
        priority: 'medium',
        timestamp: Date.now(),
        retries: 0
      });
    });

    this.client.on('interactionCreate', async (interaction) => {
      if (!interaction.isChatInputCommand()) return;

      const securityCheck = await securityFramework.validateCommand(interaction);
      
      if (!securityCheck.allowed) {
        await interaction.reply({
          content: securityCheck.reason || 'Command not allowed',
          ephemeral: true
        });
        return;
      }

      await this.queueEvent({
        type: 'command_execution',
        data: {
          interaction: {
            commandName: interaction.commandName,
            userId: interaction.user.id,
            guildId: interaction.guild?.id,
            options: interaction.options.data
          }
        },
        priority: 'high',
        timestamp: Date.now(),
        retries: 0
      });
    });

    this.client.on('guildMemberAdd', async (member) => {
      await this.queueEvent({
        type: 'member_join',
        data: {
          userId: member.id,
          guildId: member.guild.id,
          joinedAt: member.joinedAt
        },
        priority: 'low',
        timestamp: Date.now(),
        retries: 0
      });
    });

    this.client.on('voiceStateUpdate', async (oldState, newState) => {
      if (newState.member?.user.bot) return;

      await this.queueEvent({
        type: 'voice_state_change',
        data: {
          userId: newState.member?.id,
          guildId: newState.guild.id,
          oldChannelId: oldState.channelId,
          newChannelId: newState.channelId,
          timestamp: Date.now()
        },
        priority: 'low',
        timestamp: Date.now(),
        retries: 0
      });
    });
  }

  async queueEvent(eventData: EventWorkerData): Promise<void> {
    const queue = this.eventQueue[eventData.priority];
    queue.push(eventData);

    if (eventData.priority === 'critical') {
      await this.processEventImmediately(eventData);
    }

    this.emit('eventQueued', eventData);
  }

  private async processEventImmediately(eventData: EventWorkerData): Promise<void> {
    const availableWorker = this.getAvailableWorker();
    if (availableWorker !== -1) {
      await this.assignEventToWorker(availableWorker, eventData);
    } else {
      this.eventQueue.critical.unshift(eventData);
    }
  }

  private startEventProcessor(): void {
    setInterval(async () => {
      await this.processEventQueues();
    }, 50);

    setInterval(async () => {
      await this.processBufferedEvents();
    }, 1000);

    setInterval(() => {
      this.processDeadLetterQueue();
    }, 5000);
  }

  private async processEventQueues(): Promise<void> {
    const priorities: (keyof EventQueue)[] = ['critical', 'high', 'medium', 'low'];
    
    for (const priority of priorities) {
      const queue = this.eventQueue[priority];
      
      while (queue.length > 0) {
        const availableWorker = this.getAvailableWorker();
        if (availableWorker === -1) break;

        const eventData = queue.shift()!;
        await this.assignEventToWorker(availableWorker, eventData);
      }
    }
  }

  private async assignEventToWorker(workerId: number, eventData: EventWorkerData): Promise<void> {
    this.workerPool.available[workerId] = false;
    this.workerPool.processing.set(workerId, eventData);

    const start = performance.now();
    
    try {
      this.workerPool.workers[workerId].postMessage(eventData);
      
      const stats = this.processingStats.get(eventData.type) || { count: 0, totalTime: 0 };
      stats.count++;
      this.processingStats.set(eventData.type, stats);
      
    } catch (error) {
      console.error(`Error assigning event to worker ${workerId}:`, error);
      this.handleEventFailure(eventData, error);
      this.workerPool.available[workerId] = true;
      this.workerPool.processing.delete(workerId);
    }
  }

  private handleWorkerResult(workerId: number, result: any): void {
    const eventData = this.workerPool.processing.get(workerId);
    if (!eventData) return;

    this.workerPool.available[workerId] = true;
    this.workerPool.processing.delete(workerId);

    if (result.success) {
      this.handleEventSuccess(eventData, result.result);
    } else {
      this.handleEventFailure(eventData, new Error(result.error));
    }
  }

  private handleWorkerError(workerId: number, error: Error): void {
    const eventData = this.workerPool.processing.get(workerId);
    if (eventData) {
      this.handleEventFailure(eventData, error);
    }

    this.workerPool.available[workerId] = true;
    this.workerPool.processing.delete(workerId);

    this.restartWorker(workerId);
  }

  private async handleEventSuccess(eventData: EventWorkerData, result: any): Promise<void> {
    switch (eventData.type) {
      case 'message_xp':
        await this.handleXPGain(eventData.data, result);
        break;
      case 'command_execution':
        await this.handleCommandExecution(eventData.data, result);
        break;
      case 'member_join':
        await this.handleMemberJoin(eventData.data, result);
        break;
      case 'voice_state_change':
        await this.handleVoiceStateChange(eventData.data, result);
        break;
    }

    this.emit('eventProcessed', eventData, result);
  }

  private handleEventFailure(eventData: EventWorkerData, error: Error): void {
    console.error(`Event processing failed for ${eventData.type}:`, error);

    if (eventData.retries < this.maxRetries) {
      eventData.retries++;
      this.queueEvent(eventData);
    } else {
      this.deadLetterQueue.push(eventData);
      this.emit('eventFailed', eventData, error);
    }
  }

  private async handleXPGain(data: any, result: any): Promise<void> {
    const xpResult = await optimizedXPSystem.gainXP(
      data.userId,
      data.guildId,
      data.username,
      'message'
    );

    if (xpResult?.levelUp && xpResult.newLevel) {
      await this.queueEvent({
        type: 'level_up',
        data: {
          userId: data.userId,
          guildId: data.guildId,
          newLevel: xpResult.newLevel
        },
        priority: 'high',
        timestamp: Date.now(),
        retries: 0
      });
    }
  }

  private async handleCommandExecution(data: any, result: any): Promise<void> {
    const command = this.client.commands.get(data.interaction.commandName);
    if (command) {
      this.bufferEvent('command_usage', {
        commandName: data.interaction.commandName,
        userId: data.interaction.userId,
        guildId: data.interaction.guildId,
        timestamp: Date.now()
      });
    }
  }

  private async handleMemberJoin(data: any, result: any): Promise<void> {
    this.bufferEvent('member_activity', {
      type: 'join',
      userId: data.userId,
      guildId: data.guildId,
      timestamp: data.joinedAt
    });
  }

  private async handleVoiceStateChange(data: any, result: any): Promise<void> {
    if (data.newChannelId && !data.oldChannelId) {
      this.bufferEvent('voice_activity', {
        type: 'join',
        userId: data.userId,
        guildId: data.guildId,
        channelId: data.newChannelId,
        timestamp: data.timestamp
      });
    } else if (!data.newChannelId && data.oldChannelId) {
      this.bufferEvent('voice_activity', {
        type: 'leave',
        userId: data.userId,
        guildId: data.guildId,
        channelId: data.oldChannelId,
        timestamp: data.timestamp
      });
    }
  }

  private bufferEvent(type: string, data: any): void {
    const buffer = this.eventBuffer.get(type) || [];
    buffer.push(data);
    
    if (buffer.length > 1000) {
      buffer.shift();
    }
    
    this.eventBuffer.set(type, buffer);
  }

  private async processBufferedEvents(): Promise<void> {
    for (const [type, events] of this.eventBuffer) {
      if (events.length === 0) continue;

      try {
        switch (type) {
          case 'command_usage':
            await this.processCommandUsageBuffer(events);
            break;
          case 'member_activity':
            await this.processMemberActivityBuffer(events);
            break;
          case 'voice_activity':
            await this.processVoiceActivityBuffer(events);
            break;
        }

        events.length = 0;
      } catch (error) {
        console.error(`Error processing buffered events for ${type}:`, error);
      }
    }
  }

  private async processCommandUsageBuffer(events: any[]): Promise<void> {
    const usage = events.reduce((acc, event) => {
      const key = `${event.guildId}-${event.commandName}`;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    for (const [key, count] of Object.entries(usage)) {
      const [guildId, commandName] = key.split('-');
      performanceManager.setCache(`command-usage-${guildId}-${commandName}`, count, 3600000);
    }
  }

  private async processMemberActivityBuffer(events: any[]): Promise<void> {
    const activity = events.reduce((acc, event) => {
      const key = event.guildId;
      if (!acc[key]) acc[key] = { joins: 0, leaves: 0 };
      if (event.type === 'join') acc[key].joins++;
      else acc[key].leaves++;
      return acc;
    }, {} as Record<string, { joins: number; leaves: number }>);

    for (const [guildId, stats] of Object.entries(activity)) {
      performanceManager.setCache(`member-activity-${guildId}`, stats, 3600000);
    }
  }

  private async processVoiceActivityBuffer(events: any[]): Promise<void> {
    const activity = events.reduce((acc, event) => {
      const key = `${event.guildId}-${event.channelId}`;
      if (!acc[key]) acc[key] = { joins: 0, leaves: 0 };
      if (event.type === 'join') acc[key].joins++;
      else acc[key].leaves++;
      return acc;
    }, {} as Record<string, { joins: number; leaves: number }>);

    for (const [key, stats] of Object.entries(activity)) {
      performanceManager.setCache(`voice-activity-${key}`, stats, 3600000);
    }
  }

  private processDeadLetterQueue(): void {
    while (this.deadLetterQueue.length > 0) {
      const eventData = this.deadLetterQueue.shift()!;
      
      if (Date.now() - eventData.timestamp > 300000) {
        continue;
      }

      eventData.retries = 0;
      this.queueEvent(eventData);
    }
  }

  private getAvailableWorker(): number {
    return this.workerPool.available.findIndex(available => available);
  }

  private restartWorker(workerId: number): void {
    try {
      this.workerPool.workers[workerId].terminate();
    } catch (error) {
      console.error(`Error terminating worker ${workerId}:`, error);
    }

    this.initializeWorkerPool();
  }

  private startMetricsCollection(): void {
    setInterval(() => {
      const metrics = this.getMetrics();
      performanceManager.setCache('event-handler-metrics', metrics, 60000);
      this.emit('metrics', metrics);
    }, 30000);
  }

  getMetrics(): any {
    const queueSizes = {
      critical: this.eventQueue.critical.length,
      high: this.eventQueue.high.length,
      medium: this.eventQueue.medium.length,
      low: this.eventQueue.low.length
    };

    const workerUtilization = this.workerPool.available.filter(a => !a).length / this.maxWorkers;

    const processingStats = Object.fromEntries(
      Array.from(this.processingStats.entries()).map(([type, stats]) => [
        type,
        {
          count: stats.count,
          avgTime: stats.totalTime / stats.count
        }
      ])
    );

    return {
      queueSizes,
      totalQueued: Object.values(queueSizes).reduce((sum, size) => sum + size, 0),
      workerUtilization,
      deadLetterQueue: this.deadLetterQueue.length,
      bufferedEvents: Array.from(this.eventBuffer.values()).reduce((sum, arr) => sum + arr.length, 0),
      processingStats
    };
  }

  async gracefulShutdown(): Promise<void> {
    console.log('🛑 Shutting down event handler gracefully...');
    
    await this.processEventQueues();
    await this.processBufferedEvents();

    for (const worker of this.workerPool.workers) {
      await worker.terminate();
    }

    console.log('✅ Event handler shutdown complete');
  }
}

export const createClusteredEventHandler = (client: ExtendedClient) => new ClusteredEventHandler(client);