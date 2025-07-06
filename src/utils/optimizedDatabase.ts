import { PrismaClient } from '@prisma/client';
import { performanceManager } from './performanceManager';
import { EventEmitter } from 'events';

interface ConnectionPool {
  read: PrismaClient[];
  write: PrismaClient;
  currentReadIndex: number;
}

interface QueryCache {
  result: any;
  timestamp: number;
  ttl: number;
  tags: string[];
}

interface BatchOperation {
  operation: string;
  data: any;
  resolve: (value: any) => void;
  reject: (error: any) => void;
}

export class OptimizedDatabase extends EventEmitter {
  private pools: Map<string, ConnectionPool> = new Map();
  private queryCache = new Map<string, QueryCache>();
  private batchQueue: BatchOperation[] = [];
  private batchTimer: NodeJS.Timeout | null = null;
  private readyPromise: Promise<void>;

  constructor() {
    super();
    this.readyPromise = this.initializePools();
  }

  private async initializePools(): Promise<void> {
    const readClients = await Promise.all([
      this.createClient('read-1'),
      this.createClient('read-2'),
      this.createClient('read-3')
    ]);

    const writeClient = await this.createClient('write');

    this.pools.set('default', {
      read: readClients,
      write: writeClient,
      currentReadIndex: 0
    });

    this.startBatchProcessor();
    this.startCacheCleanup();
    
    console.log('✅ Optimized database pools initialized');
  }

  private async createClient(identifier: string): Promise<PrismaClient> {
    const client = new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['warn', 'error'],
      datasources: {
        db: {
          url: this.getConnectionString(identifier)
        }
      }
    });

    await client.$connect();
    return client;
  }

  private getConnectionString(identifier: string): string {
    const baseUrl = process.env.DATABASE_URL || '';
    return `${baseUrl}?connection_limit=20&pool_timeout=60&application_name=pegasus-${identifier}`;
  }

  private getReadClient(): PrismaClient {
    const pool = this.pools.get('default')!;
    const client = pool.read[pool.currentReadIndex];
    pool.currentReadIndex = (pool.currentReadIndex + 1) % pool.read.length;
    return client;
  }

  private getWriteClient(): PrismaClient {
    return this.pools.get('default')!.write;
  }

  async query<T>(
    operation: string,
    queryFn: (client: PrismaClient) => Promise<T>,
    options: {
      cache?: { key: string; ttl?: number; tags?: string[] };
      readOnly?: boolean;
      batch?: boolean;
    } = {}
  ): Promise<T> {
    await this.readyPromise;

    if (options.cache) {
      const cached = this.getCachedResult<T>(options.cache.key);
      if (cached) {
        performanceManager.emit('cache-hit', options.cache.key);
        return cached;
      }
    }

    if (options.batch) {
      return this.addToBatch<T>(operation, queryFn, options);
    }

    const client = options.readOnly ? this.getReadClient() : this.getWriteClient();
    
    return performanceManager.measureDatabaseQuery(operation, async () => {
      try {
        if (!performanceManager.checkCircuitBreaker(`db-${operation}`)) {
          throw new Error(`Circuit breaker open for ${operation}`);
        }

        const result = await queryFn(client);
        
        performanceManager.recordServiceSuccess(`db-${operation}`);

        if (options.cache) {
          this.setCachedResult(
            options.cache.key,
            result,
            options.cache.ttl || 300000,
            options.cache.tags || []
          );
        }

        return result;
      } catch (error) {
        performanceManager.recordServiceFailure(`db-${operation}`);
        throw error;
      }
    });
  }

  async transaction<T>(
    operations: ((client: PrismaClient) => Promise<any>)[],
    options: { timeout?: number } = {}
  ): Promise<T[]> {
    await this.readyPromise;
    const client = this.getWriteClient();
    
    return performanceManager.measureDatabaseQuery('transaction', async () => {
      return client.$transaction(operations, {
        timeout: options.timeout || 10000,
        maxWait: 5000
      });
    });
  }

  async batchWrite<T>(
    operations: { operation: string; data: any }[]
  ): Promise<T[]> {
    if (operations.length === 0) return [];
    
    const client = this.getWriteClient();
    const batchSize = 100;
    const results: T[] = [];

    for (let i = 0; i < operations.length; i += batchSize) {
      const batch = operations.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(op => 
          performanceManager.measureDatabaseQuery(op.operation, () =>
            this.executeBatchOperation(client, op)
          )
        )
      );
      results.push(...batchResults);
    }

    return results;
  }

  private async executeBatchOperation(client: PrismaClient, operation: any): Promise<any> {
    switch (operation.operation) {
      case 'user.upsert':
        return (client as any).user.upsert(operation.data);
      case 'user.update':
        return (client as any).user.update(operation.data);
      case 'xpHistory.create':
        return (client as any).xPHistory.create(operation.data);
      default:
        throw new Error(`Unknown batch operation: ${operation.operation}`);
    }
  }

  private addToBatch<T>(
    operation: string,
    queryFn: (client: PrismaClient) => Promise<T>,
    options: any
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      this.batchQueue.push({
        operation,
        data: { queryFn, options },
        resolve,
        reject
      });

      if (!this.batchTimer) {
        this.batchTimer = setTimeout(() => {
          this.processBatch();
        }, 10);
      }
    });
  }

  private async processBatch(): Promise<void> {
    const batch = this.batchQueue.splice(0);
    this.batchTimer = null;

    if (batch.length === 0) return;

    const client = this.getWriteClient();
    
    try {
      const results = await Promise.allSettled(
        batch.map(item => item.data.queryFn(client))
      );

      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          batch[index].resolve(result.value);
        } else {
          batch[index].reject(result.reason);
        }
      });
    } catch (error) {
      batch.forEach(item => item.reject(error));
    }
  }

  private getCachedResult<T>(key: string): T | null {
    const cached = this.queryCache.get(key);
    if (!cached) return null;

    if (Date.now() - cached.timestamp > cached.ttl) {
      this.queryCache.delete(key);
      return null;
    }

    return cached.result;
  }

  private setCachedResult(key: string, result: any, ttl: number, tags: string[]): void {
    this.queryCache.set(key, {
      result,
      timestamp: Date.now(),
      ttl,
      tags
    });
  }

  invalidateCache(tags: string[]): void {
    for (const [key, cache] of this.queryCache) {
      if (tags.some(tag => cache.tags.includes(tag))) {
        this.queryCache.delete(key);
      }
    }
  }

  private startBatchProcessor(): void {
    setInterval(() => {
      if (this.batchQueue.length > 0) {
        this.processBatch();
      }
    }, 50);
  }

  private startCacheCleanup(): void {
    setInterval(() => {
      const now = Date.now();
      for (const [key, cache] of this.queryCache) {
        if (now - cache.timestamp > cache.ttl) {
          this.queryCache.delete(key);
        }
      }
    }, 60000);
  }

  async getHealthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    connections: number;
    cacheSize: number;
    avgQueryTime: number;
  }> {
    const pool = this.pools.get('default');
    if (!pool) {
      return { status: 'unhealthy', connections: 0, cacheSize: 0, avgQueryTime: 0 };
    }

    try {
      const start = performance.now();
      await pool.write.$queryRaw`SELECT 1`;
      const queryTime = performance.now() - start;

      return {
        status: queryTime < 100 ? 'healthy' : queryTime < 500 ? 'degraded' : 'unhealthy',
        connections: pool.read.length + 1,
        cacheSize: this.queryCache.size,
        avgQueryTime: queryTime
      };
    } catch (error) {
      return { status: 'unhealthy', connections: 0, cacheSize: 0, avgQueryTime: 0 };
    }
  }

  async disconnect(): Promise<void> {
    const pool = this.pools.get('default');
    if (pool) {
      await Promise.all([
        ...pool.read.map(client => client.$disconnect()),
        pool.write.$disconnect()
      ]);
    }
  }
}

export const optimizedDatabase = new OptimizedDatabase();

export const db = {
  query: optimizedDatabase.query.bind(optimizedDatabase),
  transaction: optimizedDatabase.transaction.bind(optimizedDatabase),
  batchWrite: optimizedDatabase.batchWrite.bind(optimizedDatabase),
  invalidateCache: optimizedDatabase.invalidateCache.bind(optimizedDatabase),
  getHealthCheck: optimizedDatabase.getHealthCheck.bind(optimizedDatabase)
};