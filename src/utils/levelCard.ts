import { AttachmentBuilder, ColorResolvable, EmbedBuilder } from 'discord.js';
import { LevelCardOptions, CardTheme } from '../types';
import { XPSystem } from './xpSystem';

export class LevelCardGenerator {
  private static themes: Map<string, CardTheme> = new Map([
    ['default', {
      name: 'Default',
      primaryColor: '#7289da',
      secondaryColor: '#5865f2',
      textColor: '#ffffff',
      progressBarColor: '#5865f2',
      backgroundGradient: ['#36393f', '#2f3136']
    }],
    ['dark', {
      name: 'Dark',
      primaryColor: '#000000',
      secondaryColor: '#1a1a1a',
      textColor: '#ffffff',
      progressBarColor: '#ffffff',
      backgroundGradient: ['#000000', '#1a1a1a']
    }],
    ['blue', {
      name: 'Blue',
      primaryColor: '#0099ff',
      secondaryColor: '#0066cc',
      textColor: '#ffffff',
      progressBarColor: '#00ccff',
      backgroundGradient: ['#001a33', '#003366']
    }],
    ['green', {
      name: 'Green',
      primaryColor: '#00ff99',
      secondaryColor: '#00cc66',
      textColor: '#ffffff',
      progressBarColor: '#00ff99',
      backgroundGradient: ['#001a0d', '#003319']
    }],
    ['purple', {
      name: 'Purple',
      primaryColor: '#9900ff',
      secondaryColor: '#6600cc',
      textColor: '#ffffff',
      progressBarColor: '#cc00ff',
      backgroundGradient: ['#1a0033', '#330066']
    }],
    ['red', {
      name: 'Red',
      primaryColor: '#ff3333',
      secondaryColor: '#cc0000',
      textColor: '#ffffff',
      progressBarColor: '#ff6666',
      backgroundGradient: ['#330000', '#660000']
    }],
    ['gold', {
      name: 'Gold',
      primaryColor: '#ffcc00',
      secondaryColor: '#ff9900',
      textColor: '#000000',
      progressBarColor: '#ffcc00',
      backgroundGradient: ['#332200', '#664400']
    }]
  ]);

  // Einfache Text-basierte "Level-Karte" als Embed
  static async generateLevelCard(
    username: string,
    avatarUrl: string,
    level: number,
    currentXp: number,
    rank: number,
    options: LevelCardOptions
  ): Promise<{ embed: EmbedBuilder; attachment?: AttachmentBuilder }> {
    
    const theme = this.themes.get(options.theme) || this.themes.get('default')!;
    const xpProgress = XPSystem.calculateXPForNextLevel(currentXp);
    const progressPercentage = Math.round((xpProgress.current / xpProgress.total) * 100);
    
    // Erstelle einen schönen Progress Bar als Text
    const progressBar = this.createTextProgressBar(progressPercentage, 20);
    
    const embed = new EmbedBuilder()
      .setTitle(`🌟 Level ${level}`)
      .setDescription(`**${username}**`)
      .setColor((options.color || theme.primaryColor) as ColorResolvable)
      .setThumbnail(avatarUrl)
      .addFields(
        {
          name: '📊 Progress',
          value: `\`\`\`${progressBar}\`\`\`\n**${xpProgress.current.toLocaleString()}** / **${xpProgress.total.toLocaleString()}** XP`,
          inline: false
        },
        {
          name: '🎯 Stats',
          value: `**Rank:** #${rank}\n**Next Level:** ${xpProgress.needed.toLocaleString()} XP needed`,
          inline: true
        },
        {
          name: '🎨 Theme',
          value: `**${theme.name}**\nColor: \`${options.color}\``,
          inline: true
        }
      )
      .setFooter({ 
        text: `Level Card • ${progressPercentage}% to next level`,
        iconURL: avatarUrl 
      })
      .setTimestamp();

    return { embed };
  }

  private static createTextProgressBar(percentage: number, length: number = 20): string {
    const filled = Math.round((percentage / 100) * length);
    const empty = length - filled;
    
    const fillChar = '█';
    const emptyChar = '░';
    
    return `${fillChar.repeat(filled)}${emptyChar.repeat(empty)} ${percentage}%`;
  }

  static getAvailableThemes(): string[] {
    return Array.from(this.themes.keys());
  }

  static getTheme(name: string): CardTheme | undefined {
    return this.themes.get(name);
  }

  static isValidTheme(name: string): boolean {
    return this.themes.has(name);
  }

  static isValidHexColor(color: string): boolean {
    return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color);
  }

  // Vereinfachte URL-Validierung ohne Canvas
  static async isValidImageUrl(url: string): Promise<boolean> {
    try {
      const response = await fetch(url, { method: 'HEAD' });
      const contentType = response.headers.get('content-type');
      return !!(contentType && contentType.startsWith('image/'));
    } catch {
      return false;
    }
  }
}