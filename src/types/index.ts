import { SlashCommandBuilder, ChatInputCommandInteraction, Client, Collection, PermissionResolvable } from 'discord.js';

export interface Command {
  data: SlashCommandBuilder;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
  category?: string;
  permissions?: PermissionResolvable[];
  adminOnly?: boolean;
}

export interface ExtendedClient extends Client {
  commands: Collection<string, Command>;
}

export interface LevelCardOptions {
  theme: string;
  color: string;
  backgroundImage?: string;
  textColor?: string;
  progressBarColor?: string;
}

export interface XPSettings {
  minXp: number;
  maxXp: number;
  cooldown: number;
  xpRate: number;
  enabled: boolean;
}

export interface UserStats {
  userId: string;
  guildId: string;
  username: string;
  xp: number;
  level: number;
  totalXp: number;
  monthlyXp: number;
  rank?: number;
  monthlyRank?: number;
}

export interface LeaderboardEntry {
  userId: string;
  username: string;
  xp: number;
  level: number;
  rank: number;
}

export interface CardTheme {
  name: string;
  primaryColor: string;
  secondaryColor: string;
  textColor: string;
  progressBarColor: string;
  backgroundGradient?: string[];
}

export enum XPGainReason {
  MESSAGE = 'message',
  VOICE = 'voice',
  BONUS = 'bonus',
  ADMIN = 'admin'
}

export interface GuildSettings {
  id: string;
  language: string;
  xpEnabled: boolean;
  xpMin: number;
  xpMax: number;
  xpCooldown: number;
  xpRate: number;
  levelRoles: LevelRole[];
}

export interface LevelRole {
  id: number;
  guildId: string;
  level: number;
  roleId: string;
}

export interface MultiGuildUser {
  userId: string;
  guilds: Map<string, UserStats>;
}

export type CommandCategory = 'general' | 'level' | 'admin' | 'moderation';

export interface BotEvent {
  name: string;
  once?: boolean;
  execute: (...args: any[]) => Promise<void>;
}