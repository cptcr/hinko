import i18next from 'i18next';
import Backend from 'i18next-fs-backend';
import path from 'path';
import { prisma } from './database';

export async function initializeI18n() {
  await i18next
    .use(Backend)
    .init({
      lng: 'en',
      fallbackLng: 'en',
      debug: process.env.NODE_ENV === 'development',
      backend: {
        loadPath: path.join(__dirname, '../../locales/{{lng}}.json')
      },
      interpolation: {
        escapeValue: false
      },
      returnObjects: true
    });

  console.log('✅ i18n initialized with languages:', i18next.languages);
}

export function t(key: string, options?: any, lng?: string): string {
  return i18next.t(key, { ...options, lng }) as string;
}

export async function getUserLanguage(userId: string, guildId: string): Promise<string> {
  try {
    const user = await prisma.user.findUnique({
      where: {
        id_guildId: {
          id: userId,
          guildId: guildId
        }
      },
      select: { language: true }
    });

    if (user?.language) {
      return user.language;
    }

    // Fallback to guild language
    const guild = await prisma.guild.findUnique({
      where: { id: guildId },
      select: { language: true }
    });

    return guild?.language || 'en';
  } catch (error) {
    console.error('Error getting user language:', error);
    return 'en';
  }
}

export async function getGuildLanguage(guildId: string): Promise<string> {
  try {
    const guild = await prisma.guild.findUnique({
      where: { id: guildId },
      select: { language: true }
    });

    return guild?.language || 'en';
  } catch (error) {
    console.error('Error getting guild language:', error);
    return 'en';
  }
}

export async function setUserLanguage(userId: string, guildId: string, language: string): Promise<void> {
  try {
    await prisma.user.update({
      where: {
        id_guildId: {
          id: userId,
          guildId: guildId
        }
      },
      data: { language: language }
    });
  } catch (error) {
    console.error('Error setting user language:', error);
  }
}

export async function setGuildLanguage(guildId: string, language: string): Promise<void> {
  try {
    await prisma.guild.update({
      where: { id: guildId },
      data: { language: language }
    });
  } catch (error) {
    console.error('Error setting guild language:', error);
  }
}

export const supportedLanguages = ['en', 'de'];

export function isLanguageSupported(language: string): boolean {
  return supportedLanguages.includes(language);
}

export function formatNumber(num: number, lng?: string): string {
  const formatter = new Intl.NumberFormat(lng === 'de' ? 'de-DE' : 'en-US');
  return formatter.format(num);
}

export function formatDate(date: Date, lng?: string): string {
  const formatter = new Intl.DateTimeFormat(lng === 'de' ? 'de-DE' : 'en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
  return formatter.format(date);
}

export function formatRelativeTime(date: Date, lng?: string): string {
  const formatter = new Intl.RelativeTimeFormat(lng === 'de' ? 'de-DE' : 'en-US', {
    numeric: 'auto'
  });
  
  const now = new Date();
  const diffInSeconds = Math.floor((date.getTime() - now.getTime()) / 1000);
  
  if (Math.abs(diffInSeconds) < 60) {
    return formatter.format(diffInSeconds, 'second');
  } else if (Math.abs(diffInSeconds) < 3600) {
    return formatter.format(Math.floor(diffInSeconds / 60), 'minute');
  } else if (Math.abs(diffInSeconds) < 86400) {
    return formatter.format(Math.floor(diffInSeconds / 3600), 'hour');
  } else {
    return formatter.format(Math.floor(diffInSeconds / 86400), 'day');
  }
}