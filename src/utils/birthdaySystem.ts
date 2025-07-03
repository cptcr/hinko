import * as cron from 'node-cron';
import { Client, EmbedBuilder, TextChannel } from 'discord.js';
import { prisma } from './database';

export function startBirthdayCron(client: Client) {
  cron.schedule('0 0 * * *', async () => {
    console.log('🎂 Running daily birthday check...');
    await checkTodaysBirthdays(client);
  });

  console.log('✅ Birthday cron job started (daily at 00:00 UTC)');
}

async function checkTodaysBirthdays(client: Client) {
  const today = new Date();
  const todayStr = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  
  try {
    const birthdaysToday = await prisma.birthday.findMany({
      where: { date: todayStr },
      include: {
        guild: {
          include: {
            communitySettings: true
          }
        }
      }
    });

    const birthdaysByGuild = birthdaysToday.reduce((acc: any, birthday: any) => {
      if (!acc[birthday.guildId]) {
        acc[birthday.guildId] = [];
      }
      acc[birthday.guildId].push(birthday);
      return acc;
    }, {});

    for (const [guildId, birthdays] of Object.entries(birthdaysByGuild)) {
      await announceBirthdays(client, guildId, birthdays as any[]);
    }

    if (Object.keys(birthdaysByGuild).length > 0) {
      console.log(`🎉 Announced birthdays in ${Object.keys(birthdaysByGuild).length} guilds`);
    }
  } catch (error) {
    console.error('❌ Error checking birthdays:', error);
  }
}

async function announceBirthdays(client: Client, guildId: string, birthdays: any[]) {
  try {
    const guild = await client.guilds.fetch(guildId);
    if (!guild) return;

    const settings = birthdays[0]?.guild?.communitySettings;
    if (!settings?.birthdayChannelId || !settings.birthdayEnabled) {
      return;
    }

    const channel = guild.channels.cache.get(settings.birthdayChannelId) as TextChannel;
    if (!channel) return;

    const birthdayUsers: any[] = [];
    for (const birthday of birthdays) {
      try {
        const member = await guild.members.fetch(birthday.userId);
        if (member) {
          birthdayUsers.push(member);
        }
      } catch (error) {
        console.log(`Could not fetch member ${birthday.userId} in guild ${guildId}`);
      }
    }

    if (birthdayUsers.length === 0) return;

    const embed = new EmbedBuilder()
      .setTitle('🎉 Happy Birthday!')
      .setColor('#ffd700')
      .setDescription(
        birthdayUsers.length === 1
          ? `It's ${birthdayUsers[0].toString()}'s birthday today! 🎂`
          : `It's a special day! We're celebrating:\n${birthdayUsers.map((u: any) => `🎂 ${u.toString()}`).join('\n')}`
      )
      .setThumbnail('https://cdn.discordapp.com/emojis/787671204436688916.png')
      .addFields({
        name: '🎁 Birthday Wishes',
        value: 'Wishing you all the happiness, joy, and success on your special day!',
        inline: false
      })
      .setTimestamp();

    await channel.send({ 
      content: birthdayUsers.map((u: any) => u.toString()).join(' '), 
      embeds: [embed] 
    });

    for (const member of birthdayUsers) {
      try {
        const dmEmbed = new EmbedBuilder()
          .setTitle('🎂 Happy Birthday!')
          .setDescription(`The ${guild.name} community wishes you a very happy birthday! 🎉`)
          .setColor('#ffd700')
          .setThumbnail(member.displayAvatarURL({ size: 128 }))
          .setTimestamp();

        await member.send({ embeds: [dmEmbed] });
      } catch (error) {
        console.log(`Could not send birthday DM to ${member.id}`);
      }
    }

  } catch (error) {
    console.error(`Error announcing birthdays in guild ${guildId}:`, error);
  }
}

export async function getUpcomingBirthdays(guildId: string, days: number = 7) {
  const today = new Date();
  const upcoming: any[] = [];
  
  for (let i = 1; i <= days; i++) {
    const checkDate = new Date(today);
    checkDate.setDate(today.getDate() + i);
    const dateStr = `${String(checkDate.getMonth() + 1).padStart(2, '0')}-${String(checkDate.getDate()).padStart(2, '0')}`;
    
    const birthdays = await prisma.birthday.findMany({
      where: { guildId, date: dateStr }
    });
    
    birthdays.forEach(b => upcoming.push({ 
      ...b, 
      date: dateStr,
      daysUntil: i,
      displayDate: checkDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
    }));
  }
  
  return upcoming;
}

export async function getBirthdayStats(guildId: string) {
  const totalBirthdays = await prisma.birthday.count({
    where: { guildId }
  });

  const today = new Date();
  const todayStr = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  
  const todayCount = await prisma.birthday.count({
    where: { guildId, date: todayStr }
  });

  const upcoming = await getUpcomingBirthdays(guildId, 30);

  const monthCounts = await prisma.$queryRaw<{ month: string; count: bigint }[]>`
    SELECT SUBSTRING(date, 1, 2) as month, COUNT(*) as count
    FROM "Birthday"
    WHERE "guildId" = ${guildId}
    GROUP BY SUBSTRING(date, 1, 2)
    ORDER BY month
  `;

  return {
    total: totalBirthdays,
    today: todayCount,
    upcoming: upcoming.length,
    byMonth: monthCounts.map(m => ({
      month: parseInt(m.month),
      count: Number(m.count)
    }))
  };
}