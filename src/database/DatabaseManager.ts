// src/database/DatabaseManager.ts - Updated with Fixed Prisma Client
import { PrismaClient } from '@prisma/client';
import { Logger } from '../utils/Logger.js';
import { prisma } from './PrismaClient.js';

export class DatabaseManager {
  private db: PrismaClient;
  private logger: typeof Logger;

  constructor(logger: typeof Logger) {
    this.db = prisma;
    this.logger = logger;
  }

  async initialize(): Promise<void> {
    try {
      // Test database connection
      await this.db.$queryRaw`SELECT 1`;
      
      // Run any necessary migrations or setup
      this.logger.info('Database manager initialized');
    } catch (error) {
      this.logger.error('Failed to initialize database manager:', error);
      throw error;
    }
  }

  async createGuildIfNotExists(guildId: string, guildName: string): Promise<void> {
    try {
      await this.db.guild.upsert({
        where: { id: guildId },
        update: { name: guildName },
        create: {
          id: guildId,
          name: guildName
        }
      });
    } catch (error) {
      this.logger.error('Failed to create/update guild:', error);
    }
  }

  async cleanup(): Promise<void> {
    try {
      await this.db.$disconnect();
      this.logger.info('Database disconnected');
    } catch (error) {
      this.logger.error('Error during database cleanup:', error);
    }
  }
}