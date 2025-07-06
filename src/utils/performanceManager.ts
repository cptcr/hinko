import { EventEmitter } from 'events';
import { performance } from 'perf_hooks';

interface PerformanceMetrics {
  commandExecutionTime: Map<string, number[]>;
  eventProcessingTime: Map<string, number[]>;
  databaseQueryTime: Map<string, number[]>;
  memoryUsage: number[];
  activeConnections: number;
  cacheHitRate: number;
  errorRate: number;
}

interface CacheItem<T> {
  data: T;
  timestamp: number;
  ttl: number;
  hitCount: number;
}

export class PerformanceManager extends EventEmitter {
  private metrics: PerformanceMetrics;
  private cache = new Map<string, CacheItem<any>>();
  private rateLimiters = new Map<string, Map<string, number>>();
  private circuitBreakers = new Map<string, { failures: number; lastFailure: number; state: 'open' | 'closed' | 'half-open' }>();
  
  constructor() {
    super();
    this.metrics = {
      commandExecutionTime: new Map(),
      eventProcessingTime: new Map(),
      databaseQueryTime: new Map(),
      memoryUsage: [],
      activeConnections: 0,
      cacheHitRate: 0,
      errorRate: 0
    };
    
    this.startMetricsCollection();
    this.startCacheCleanup();
  }

  measureCommandExecution<T>(commandName: string, fn: () => Promise<T>): Promise<T> {
    const start = performance.now();
    return fn().then(result => {
      const duration = performance.now() - start;
      this.recordCommandTime(commandName, duration);
      return result;
    }).catch(error => {
      const duration = performance.now() - start;
      this.recordCommandTime(commandName, duration);
      this.recordError(commandName, error);
      throw error;
    });
  }

  measureDatabaseQuery<T>(queryType: string, fn: () => Promise<T>): Promise<T> {
    const start = performance.now();
    return fn().then(result => {
      const duration = performance.now() - start;
      this.recordDbTime(queryType, duration);
      return result;
    }).catch(error => {
      const duration = performance.now() - start;
      this.recordDbTime(queryType, duration);
      throw error;
    });
  }

  setCache<T>(key: string, data: T, ttl: number = 300000): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl,
      hitCount: 0
    });
  }

  getCache<T>(key: string): T | null {
    const item = this.cache.get(key);
    if (!item) return null;

    if (Date.now() - item.timestamp > item.ttl) {
      this.cache.delete(key);
      return null;
    }

    item.hitCount++;
    return item.data;
  }

  invalidateCache(pattern?: string): void {
    if (!pattern) {
      this.cache.clear();
      return;
    }

    const regex = new RegExp(pattern);
    for (const [key] of this.cache) {
      if (regex.test(key)) {
        this.cache.delete(key);
      }
    }
  }

  checkRateLimit(identifier: string, limit: number, windowMs: number): boolean {
    const now = Date.now();
    const userLimits = this.rateLimiters.get(identifier) || new Map();
    
    const windowStart = Math.floor(now / windowMs) * windowMs;
    const currentCount = userLimits.get(windowStart.toString()) || 0;
    
    if (currentCount >= limit) {
      return false;
    }

    userLimits.set(windowStart.toString(), currentCount + 1);
    this.rateLimiters.set(identifier, userLimits);
    
    userLimits.forEach((_, window) => {
      if (parseInt(window) < now - windowMs) {
        userLimits.delete(window);
      }
    });

    return true;
  }

  checkCircuitBreaker(service: string): boolean {
    const breaker = this.circuitBreakers.get(service);
    if (!breaker) {
      this.circuitBreakers.set(service, { failures: 0, lastFailure: 0, state: 'closed' });
      return true;
    }

    const now = Date.now();
    
    if (breaker.state === 'open') {
      if (now - breaker.lastFailure > 60000) {
        breaker.state = 'half-open';
        return true;
      }
      return false;
    }

    return true;
  }

  recordServiceFailure(service: string): void {
    const breaker = this.circuitBreakers.get(service) || { failures: 0, lastFailure: 0, state: 'closed' as const };
    breaker.failures++;
    breaker.lastFailure = Date.now();
    
    if (breaker.failures >= 5) {
      breaker.state = 'open';
    }
    
    this.circuitBreakers.set(service, breaker);
  }

  recordServiceSuccess(service: string): void {
    const breaker = this.circuitBreakers.get(service);
    if (breaker) {
      breaker.failures = 0;
      breaker.state = 'closed';
      this.circuitBreakers.set(service, breaker);
    }
  }

  private recordCommandTime(commandName: string, duration: number): void {
    const times = this.metrics.commandExecutionTime.get(commandName) || [];
    times.push(duration);
    if (times.length > 100) times.shift();
    this.metrics.commandExecutionTime.set(commandName, times);
  }

  private recordDbTime(queryType: string, duration: number): void {
    const times = this.metrics.databaseQueryTime.get(queryType) || [];
    times.push(duration);
    if (times.length > 100) times.shift();
    this.metrics.databaseQueryTime.set(queryType, times);
  }

  private recordError(source: string, error: Error): void {
    this.emit('error', { source, error, timestamp: Date.now() });
  }

  private startMetricsCollection(): void {
    setInterval(() => {
      const memUsage = process.memoryUsage();
      this.metrics.memoryUsage.push(memUsage.heapUsed);
      if (this.metrics.memoryUsage.length > 60) {
        this.metrics.memoryUsage.shift();
      }

      const totalCacheItems = this.cache.size;
      const totalHits = Array.from(this.cache.values()).reduce((sum, item) => sum + item.hitCount, 0);
      this.metrics.cacheHitRate = totalCacheItems > 0 ? totalHits / totalCacheItems : 0;

      this.emit('metrics', this.getMetricsSnapshot());
    }, 10000);
  }

  private startCacheCleanup(): void {
    setInterval(() => {
      const now = Date.now();
      for (const [key, item] of this.cache) {
        if (now - item.timestamp > item.ttl) {
          this.cache.delete(key);
        }
      }
    }, 60000);
  }

  getMetricsSnapshot(): any {
    return {
      averageCommandTime: this.getAverageTime(this.metrics.commandExecutionTime),
      averageDbTime: this.getAverageTime(this.metrics.databaseQueryTime),
      memoryUsage: this.metrics.memoryUsage[this.metrics.memoryUsage.length - 1] || 0,
      cacheSize: this.cache.size,
      cacheHitRate: this.metrics.cacheHitRate,
      activeCircuitBreakers: Array.from(this.circuitBreakers.entries())
        .filter(([, breaker]) => breaker.state === 'open').length
    };
  }

  private getAverageTime(timeMap: Map<string, number[]>): Record<string, number> {
    const averages: Record<string, number> = {};
    for (const [key, times] of timeMap) {
      averages[key] = times.reduce((sum, time) => sum + time, 0) / times.length;
    }
    return averages;
  }
}

export const performanceManager = new PerformanceManager();