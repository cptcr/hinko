import { ChatInputCommandInteraction, GuildMember, User, Guild } from 'discord.js';
import { createHash, createHmac, randomBytes } from 'crypto';
import { performanceManager } from './performanceManager';
import { db } from './optimizedDatabase';

interface SecurityPolicy {
  maxCommandsPerMinute: number;
  maxFailedAttemptsBeforeBan: number;
  trustedRoles: string[];
  restrictedCommands: string[];
  allowedOrigins: string[];
  requireMFA: boolean;
}

interface SecurityIncident {
  id: string;
  type: 'rate_limit' | 'permission_bypass' | 'injection_attempt' | 'suspicious_activity';
  userId: string;
  guildId: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  details: any;
  timestamp: Date;
  resolved: boolean;
}

interface AuditLogEntry {
  action: string;
  userId: string;
  guildId: string;
  target?: string;
  details: any;
  timestamp: Date;
  ip?: string;
  userAgent?: string;
}

export class SecurityFramework {
  private securityPolicies = new Map<string, SecurityPolicy>();
  private failedAttempts = new Map<string, number>();
  private suspiciousUsers = new Set<string>();
  private incidents: SecurityIncident[] = [];
  private auditLog: AuditLogEntry[] = [];
  private sessionTokens = new Map<string, { userId: string; expires: number; permissions: string[] }>();

  constructor() {
    this.initializeDefaultPolicies();
    this.startSecurityMonitoring();
  }

  async validateCommand(interaction: ChatInputCommandInteraction): Promise<{
    allowed: boolean;
    reason?: string;
    incident?: SecurityIncident;
  }> {
    const userId = interaction.user.id;
    const guildId = interaction.guild?.id || 'dm';
    const commandName = interaction.commandName;

    try {
      const injectionCheck = this.detectInjectionAttempt(interaction);
      if (injectionCheck.detected) {
        const incident = await this.createIncident('injection_attempt', userId, guildId, 'high', {
          command: commandName,
          attemptedPayload: injectionCheck.payload
        });
        return { allowed: false, reason: 'Security violation detected', incident };
      }

      const rateLimitCheck = await this.checkAdvancedRateLimit(userId, guildId, commandName);
      if (!rateLimitCheck.allowed) {
        if (rateLimitCheck.suspicious) {
          const incident = await this.createIncident('rate_limit', userId, guildId, 'medium', {
            command: commandName,
            attemptCount: rateLimitCheck.attempts
          });
          return { allowed: false, reason: 'Rate limit exceeded', incident };
        }
        return { allowed: false, reason: 'Rate limit exceeded' };
      }

      const permissionCheck = await this.validatePermissions(interaction);
      if (!permissionCheck.valid) {
        if (permissionCheck.bypassAttempt) {
          const incident = await this.createIncident('permission_bypass', userId, guildId, 'high', {
            command: commandName,
            requiredPermissions: permissionCheck.required,
            userPermissions: permissionCheck.actual
          });
          return { allowed: false, reason: 'Permission bypass attempt detected', incident };
        }
        return { allowed: false, reason: 'Insufficient permissions' };
      }

      await this.logAuditEntry('command_executed', userId, guildId, commandName, {
        options: this.sanitizeOptions(interaction.options.data),
        channelId: interaction.channelId
      });

      return { allowed: true };
    } catch (error) {
      console.error('Security validation error:', error);
      return { allowed: false, reason: 'Security check failed' };
    }
  }

  private detectInjectionAttempt(interaction: ChatInputCommandInteraction): {
    detected: boolean;
    payload?: string;
  } {
    const suspiciousPatterns = [
      /(\$\{.*\})/gi,
      /(eval\s*\()/gi,
      /(function\s*\()/gi,
      /(javascript:)/gi,
      /(<script)/gi,
      /(union\s+select)/gi,
      /(drop\s+table)/gi,
      /(insert\s+into)/gi,
      /(delete\s+from)/gi,
      /(update\s+.*\s+set)/gi,
      /(exec\s*\()/gi,
      /(system\s*\()/gi,
      /(__proto__)/gi,
      /(constructor\s*\[)/gi
    ];

    const content = JSON.stringify(interaction.options.data);
    
    for (const pattern of suspiciousPatterns) {
      if (pattern.test(content)) {
        return {
          detected: true,
          payload: content.match(pattern)?.[0]
        };
      }
    }

    const encodingAttempts = [
      /%3c%73%63%72%69%70%74/gi,
      /\\u003c\\u0073\\u0063\\u0072\\u0069\\u0070\\u0074/gi,
      /\x3c\x73\x63\x72\x69\x70\x74/gi
    ];

    for (const pattern of encodingAttempts) {
      if (pattern.test(content)) {
        return {
          detected: true,
          payload: content.match(pattern)?.[0]
        };
      }
    }

    return { detected: false };
  }

  private async checkAdvancedRateLimit(userId: string, guildId: string, commandName: string): Promise<{
    allowed: boolean;
    suspicious: boolean;
    attempts: number;
  }> {
    const policy = this.securityPolicies.get(guildId) || this.getDefaultPolicy();
    const windowMs = 60000;
    const key = `${userId}-${guildId}-${commandName}`;
    
    const userKey = `user-${userId}`;
    if (!performanceManager.checkRateLimit(userKey, policy.maxCommandsPerMinute, windowMs)) {
      const attempts = (this.failedAttempts.get(userKey) || 0) + 1;
      this.failedAttempts.set(userKey, attempts);
      
      if (attempts > policy.maxFailedAttemptsBeforeBan) {
        this.suspiciousUsers.add(userId);
        return { allowed: false, suspicious: true, attempts };
      }
      
      return { allowed: false, suspicious: false, attempts };
    }

    const commandKey = `cmd-${key}`;
    const commandLimit = this.getCommandSpecificLimit(commandName);
    if (!performanceManager.checkRateLimit(commandKey, commandLimit, windowMs)) {
      return { allowed: false, suspicious: false, attempts: commandLimit };
    }

    this.failedAttempts.delete(userKey);
    return { allowed: true, suspicious: false, attempts: 0 };
  }

  private async validatePermissions(interaction: ChatInputCommandInteraction): Promise<{
    valid: boolean;
    bypassAttempt: boolean;
    required?: string[];
    actual?: string[];
  }> {
    if (!interaction.guild || !interaction.member) {
      return { valid: true, bypassAttempt: false };
    }

    const member = interaction.member as GuildMember;
    const command = interaction.client.commands?.get(interaction.commandName);
    
    if (!command || !('permissions' in command) || !command.permissions) {
      return { valid: true, bypassAttempt: false };
    }

    const requiredPermissions = Array.isArray(command.permissions) ? command.permissions : [command.permissions];
    const memberPermissions = member.permissions.toArray();
    
    const hasPermissions = requiredPermissions.every(perm => 
      member.permissions.has(perm as any)
    );

    if (!hasPermissions) {
      const hasAnyRequired = requiredPermissions.some(perm =>
        member.permissions.has(perm as any)
      );

      return {
        valid: false,
        bypassAttempt: hasAnyRequired,
        required: requiredPermissions.map(p => p.toString()),
        actual: memberPermissions
      };
    }

    return { valid: true, bypassAttempt: false };
  }

  async createSecurityToken(userId: string, permissions: string[], expiresInMs: number = 3600000): Promise<string> {
    const token = randomBytes(32).toString('hex');
    const expires = Date.now() + expiresInMs;
    
    this.sessionTokens.set(token, {
      userId,
      expires,
      permissions
    });

    await db.query('saveSecurityToken', async (client) => {
      return client.securityToken.create({
        data: {
          token: this.hashToken(token),
          userId,
          permissions: JSON.stringify(permissions),
          expiresAt: new Date(expires)
        }
      });
    });

    return token;
  }

  async validateSecurityToken(token: string): Promise<{
    valid: boolean;
    userId?: string;
    permissions?: string[];
  }> {
    const session = this.sessionTokens.get(token);
    
    if (session && session.expires > Date.now()) {
      return {
        valid: true,
        userId: session.userId,
        permissions: session.permissions
      };
    }

    const hashedToken = this.hashToken(token);
    const dbToken = await db.query('getSecurityToken', async (client) => {
      return client.securityToken.findFirst({
        where: {
          token: hashedToken,
          expiresAt: { gt: new Date() }
        }
      });
    }, { 
      readOnly: true,
      cache: { key: `token-${hashedToken}`, ttl: 300000 }
    });

    if (dbToken) {
      const permissions = JSON.parse(dbToken.permissions);
      return {
        valid: true,
        userId: dbToken.userId,
        permissions
      };
    }

    return { valid: false };
  }

  async revokeSecurityToken(token: string): Promise<void> {
    this.sessionTokens.delete(token);
    
    const hashedToken = this.hashToken(token);
    await db.query('revokeSecurityToken', async (client) => {
      return client.securityToken.delete({
        where: { token: hashedToken }
      });
    });
  }

  async banUser(userId: string, guildId: string, reason: string, duration?: number): Promise<void> {
    const expiresAt = duration ? new Date(Date.now() + duration) : null;
    
    await db.query('banUser', async (client) => {
      return client.securityBan.create({
        data: {
          userId,
          guildId,
          reason,
          expiresAt,
          createdAt: new Date()
        }
      });
    });

    this.suspiciousUsers.add(userId);
    
    await this.logAuditEntry('user_banned', 'system', guildId, userId, {
      reason,
      duration,
      automatic: true
    });
  }

  async isUserBanned(userId: string, guildId: string): Promise<boolean> {
    const ban = await db.query('checkUserBan', async (client) => {
      return client.securityBan.findFirst({
        where: {
          userId,
          guildId,
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: new Date() } }
          ]
        }
      });
    }, { 
      readOnly: true,
      cache: { key: `ban-${userId}-${guildId}`, ttl: 300000 }
    });

    return !!ban;
  }

  private async createIncident(
    type: SecurityIncident['type'],
    userId: string,
    guildId: string,
    severity: SecurityIncident['severity'],
    details: any
  ): Promise<SecurityIncident> {
    const incident: SecurityIncident = {
      id: randomBytes(16).toString('hex'),
      type,
      userId,
      guildId,
      severity,
      details,
      timestamp: new Date(),
      resolved: false
    };

    this.incidents.push(incident);
    
    await db.query('saveSecurityIncident', async (client) => {
      return client.securityIncident.create({
        data: {
          id: incident.id,
          type: incident.type,
          userId: incident.userId,
          guildId: incident.guildId,
          severity: incident.severity,
          details: JSON.stringify(incident.details),
          timestamp: incident.timestamp,
          resolved: incident.resolved
        }
      });
    });

    if (severity === 'critical' || severity === 'high') {
      await this.handleCriticalIncident(incident);
    }

    return incident;
  }

  private async handleCriticalIncident(incident: SecurityIncident): Promise<void> {
    console.warn(`🚨 Critical security incident: ${incident.type} - User: ${incident.userId}`);
    
    if (incident.type === 'injection_attempt' || incident.type === 'permission_bypass') {
      await this.banUser(incident.userId, incident.guildId, `Automatic ban: ${incident.type}`, 86400000);
    }
  }

  private async logAuditEntry(
    action: string,
    userId: string,
    guildId: string,
    target: string,
    details: any,
    ip?: string,
    userAgent?: string
  ): Promise<void> {
    const entry: AuditLogEntry = {
      action,
      userId,
      guildId,
      target,
      details,
      timestamp: new Date(),
      ip,
      userAgent
    };

    this.auditLog.push(entry);
    
    if (this.auditLog.length > 10000) {
      this.auditLog.shift();
    }

    await db.query('saveAuditEntry', async (client) => {
      return client.auditLog.create({
        data: {
          action: entry.action,
          userId: entry.userId,
          guildId: entry.guildId,
          target: entry.target,
          details: JSON.stringify(entry.details),
          timestamp: entry.timestamp,
          ip: entry.ip,
          userAgent: entry.userAgent
        }
      });
    }, { batch: true });
  }

  private sanitizeOptions(options: any[]): any[] {
    return options.map(option => ({
      name: option.name,
      type: option.type,
      value: typeof option.value === 'string' ? 
        option.value.replace(/[<>\"'&]/g, '') : option.value
    }));
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private getCommandSpecificLimit(commandName: string): number {
    const limits: Record<string, number> = {
      'ban': 5,
      'kick': 10,
      'warn': 15,
      'resetxp': 3,
      'eval': 1
    };
    return limits[commandName] || 30;
  }

  private initializeDefaultPolicies(): void {
    const defaultPolicy: SecurityPolicy = {
      maxCommandsPerMinute: 30,
      maxFailedAttemptsBeforeBan: 10,
      trustedRoles: [],
      restrictedCommands: ['eval', 'exec'],
      allowedOrigins: ['discord.com'],
      requireMFA: false
    };

    this.securityPolicies.set('default', defaultPolicy);
  }

  private getDefaultPolicy(): SecurityPolicy {
    return this.securityPolicies.get('default')!;
  }

  private startSecurityMonitoring(): void {
    setInterval(() => {
      this.cleanupExpiredSessions();
      this.analyzeSecurityPatterns();
    }, 300000);
  }

  private cleanupExpiredSessions(): void {
    const now = Date.now();
    for (const [token, session] of this.sessionTokens) {
      if (session.expires < now) {
        this.sessionTokens.delete(token);
      }
    }
  }

  private analyzeSecurityPatterns(): void {
    const recentIncidents = this.incidents.filter(
      incident => Date.now() - incident.timestamp.getTime() < 3600000
    );

    const userIncidentCount = new Map<string, number>();
    recentIncidents.forEach(incident => {
      const count = userIncidentCount.get(incident.userId) || 0;
      userIncidentCount.set(incident.userId, count + 1);
    });

    userIncidentCount.forEach((count, userId) => {
      if (count >= 3) {
        console.warn(`⚠️ User ${userId} has ${count} security incidents in the last hour`);
      }
    });
  }

  getSecurityMetrics(): any {
    const recentIncidents = this.incidents.filter(
      incident => Date.now() - incident.timestamp.getTime() < 86400000
    );

    return {
      totalIncidents: this.incidents.length,
      recentIncidents: recentIncidents.length,
      activeSessions: this.sessionTokens.size,
      suspiciousUsers: this.suspiciousUsers.size,
      severityBreakdown: recentIncidents.reduce((acc, incident) => {
        acc[incident.severity] = (acc[incident.severity] || 0) + 1;
        return acc;
      }, {} as Record<string, number>)
    };
  }
}

export const securityFramework = new SecurityFramework();