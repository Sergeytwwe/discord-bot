require('dotenv').config();
const { Client, GatewayIntentBits, Events } = require('discord.js');
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

console.log('starting bot with supabase database...');

// Supabase клиент
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages,
  ],
  partials: ['CHANNEL'],
});

const allowedChannels = [
  '1424338677869314078',
  '1424337548439982203',
];

const officialReplyRu = 'я могу отвечать только в официальных каналах сервера.';
const officialReplyEn = 'i can only respond in the official server channels.';

// Функции для работы с Supabase
async function getLevel(userId) {
  try {
    const { data, error } = await supabase
      .from('user_levels')
      .select('level')
      .eq('user_id', userId)
      .single();
    
    if (error || !data) return 0;
    return data.level;
  } catch (error) {
    console.error('Error getting level:', error);
    return 0;
  }
}

async function setLevel(userId, level) {
  try {
    const { error } = await supabase
      .from('user_levels')
      .upsert({ 
        user_id: userId, 
        level: level,
        updated_at: new Date().toISOString()
      });
    
    if (error) console.error('Error setting level:', error);
  } catch (error) {
    console.error('Error setting level:', error);
  }
}

async function addWarn(userId, reason) {
  try {
    const { error } = await supabase
      .from('user_warns')
      .insert({ 
        user_id: userId, 
        reason: reason 
      });
    
    if (error) console.error('Error adding warn:', error);
  } catch (error) {
    console.error('Error adding warn:', error);
  }
}

async function getUserWarns(userId) {
  try {
    const { data, error } = await supabase
      .from('user_warns')
      .select('*')
      .eq('user_id', userId)
      .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());
    
    if (error) {
      console.error('Error getting warns:', error);
      return [];
    }
    return data || [];
  } catch (error) {
    console.error('Error getting warns:', error);
    return [];
  }
}

async function clearUserWarns(userId) {
  try {
    const { error } = await supabase
      .from('user_warns')
      .delete()
      .eq('user_id', userId);
    
    if (error) console.error('Error clearing warns:', error);
  } catch (error) {
    console.error('Error clearing warns:', error);
  }
}

// Функции для работы с ключами
async function generateUniqueKey() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  
  while (true) {
    // Генерируем случайные части ключа
    const part1 = Array.from({length: 6}, () => 
      chars.charAt(Math.floor(Math.random() * chars.length))).join('');
    const part2 = Array.from({length: 6}, () => 
      chars.charAt(Math.floor(Math.random() * chars.length))).join('');
    const part3 = Array.from({length: 6}, () => 
      chars.charAt(Math.floor(Math.random() * chars.length))).join('');
    
    const key = `VERYUP-${part1}-${part2}-${part3}`;
    
    // Проверяем уникальность ключа
    const { data, error } = await supabase
      .from('generated_keys')
      .select('key')
      .eq('key', key)
      .single();
    
    if (error && error.code === 'PGRST116') {
      // Ключ не найден (уникален)
      return key;
    } else if (error) {
      console.error('Error checking key uniqueness:', error);
      // В случае ошибки продолжаем попытки
      continue;
    }
    
    // Если ключ уже существует, продолжаем генерировать
  }
}

async function saveGeneratedKey(key, generatedBy, uses = 1) {
  try {
    const { error } = await supabase
      .from('generated_keys')
      .insert({ 
        key: key,
        generated_by: generatedBy,
        uses_remaining: uses,
        created_at: new Date().toISOString()
      });
    
    if (error) {
      console.error('Error saving key:', error);
      return false;
    }
    return true;
  } catch (error) {
    console.error('Error saving key:', error);
    return false;
  }
}

async function getKeyInfo(key) {
  try {
    const { data, error } = await supabase
      .from('generated_keys')
      .select('*')
      .eq('key', key)
      .single();
    
    if (error) return null;
    return data;
  } catch (error) {
    console.error('Error getting key info:', error);
    return null;
  }
}

async function useKey(key, usedBy) {
  try {
    // Получаем информацию о ключе
    const keyInfo = await getKeyInfo(key);
    if (!keyInfo) return { success: false, message: 'Ключ не найден' };
    
    if (keyInfo.uses_remaining <= 0) {
      return { success: false, message: 'Ключ уже использован' };
    }
    
    // Обновляем количество использований
    const { error } = await supabase
      .from('generated_keys')
      .update({ 
        uses_remaining: keyInfo.uses_remaining - 1,
        used_by: usedBy,
        used_at: new Date().toISOString()
      })
      .eq('key', key);
    
    if (error) {
      console.error('Error using key:', error);
      return { success: false, message: 'Ошибка при использовании ключа' };
    }
    
    return { success: true, message: 'Ключ успешно использован' };
  } catch (error) {
    console.error('Error using key:', error);
    return { success: false, message: 'Ошибка при использовании ключа' };
  }
}

function parseDurationFromTokens(tokens, startIndex = 0) {
  for (let i = startIndex; i < tokens.length; i++) {
    const tok = tokens[i];
    const numMatch = tok.match(/[-+]?\d+(\.\d+)?/);
    if (!numMatch) continue;
    const num = parseFloat(numMatch[0]);
    const unitPart = tok.slice(numMatch[0].length).toLowerCase();
    let unitToken = unitPart || (tokens[i + 1] ? tokens[i + 1].toLowerCase() : '');
    if (unitToken.startsWith('ч') || unitToken.startsWith('h') || unitToken.includes('час'))
      return { ms: num * 60 * 60 * 1000, human: formatHumanDuration(num, 'hours') };
    if (unitToken.startsWith('м') || unitToken.startsWith('m') || unitToken.includes('мин'))
      return { ms: num * 60 * 1000, human: formatHumanDuration(num, 'minutes') };
    if (unitToken.startsWith('с') || unitToken.startsWith('s') || unitToken.includes('сек'))
      return { ms: num * 1000, human: formatHumanDuration(num, 'seconds') };
    return { ms: num * 60 * 60 * 1000, human: formatHumanDuration(num, 'hours') };
  }
  return null;
}

function formatHumanDuration(value, unit) {
  const v = Math.abs(Math.round(value));
  if (unit === 'hours') {
    if (v % 10 === 1 && v % 100 !== 11) return `${v} час`;
    if ([2, 3, 4].includes(v % 10) && !(v % 100 >= 12 && v % 100 <= 14)) return `${v} часа`;
    return `${v} часов`;
  }
  if (unit === 'minutes') {
    if (v % 10 === 1 && v % 100 !== 11) return `${v} минуту`;
    if ([2, 3, 4].includes(v % 10) && !(v % 100 >= 12 && v % 100 <= 14)) return `${v} минуты`;
    return `${v} минут`;
  }
  if (unit === 'seconds') {
    if (v % 10 === 1 && v % 100 !== 11) return `${v} секунду`;
    if ([2, 3, 4].includes(v % 10) && !(v % 100 >= 12 && v % 100 <= 14)) return `${v} секунды`;
    return `${v} секунд`;
  }
  return `${v}`;
}

client.once(Events.ClientReady, async (c) => {
  console.log(`bot started: ${c.user.tag}`);
  console.log('using supabase for data storage');
  console.log('commands: !ping, !ban, !kick, !mute, !unmute, !unban, !warn, !warns, !help, !повысить, !понизить, /generatekey');

  // Автоматически даем уровень 3 владельцам серверов
  const guilds = client.guilds.cache;
  for (const [guildId, guild] of guilds) {
    const owner = await guild.fetchOwner();
    await setLevel(owner.id, 3);
  }
});

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;

  if (!message.guild) {
    const isRussian = /[а-яё]/i.test(message.content);
    return message.reply(isRussian ? officialReplyRu : officialReplyEn);
  }

  if (!allowedChannels.includes(message.channel.id)) return;

  const content = message.content.trim();
  const parts = content.split(/\s+/);
  if (parts.length === 0) return;
  const cmd = parts[0].toLowerCase();
  const args = parts.slice(1);

  const isRussian = /[а-яё]/i.test(content);
  const level = await getLevel(message.author.id);

  const t = {
    noPerm: 'у вас нет прав для этой команды',
    notOwner: 'только владелец сервера может использовать эту команду',
    mentionUser: 'укажите пользователя',
    banListEmpty: 'банлист пуст',
    banned: (u, r) => `пользователь ${u} был забанен. причина: ${r}`,
    unbanned: (u) => `пользователь ${u} был разбанен`,
    kicked: (u) => `пользователь ${u} был кикнут`,
    muted: (u, h, r) => `пользователь ${u} был замучен на ${h}. причина: ${r}`,
    unmuted: (u) => `пользователь ${u} был размучен`,
    warned: (u, c, r) => `пользователь ${u} получил предупреждение. причина: ${r}. всего: ${c}`,
    promote: (u, l) => `пользователь ${u} был повышен, текущий уровень ${l}`,
    demote: (u, l) => `пользователь ${u} был понижен, текущий уровень ${l}`,
    yourLevel: (l) => `ваш текущий уровень ${l}`,
    yourWarnsHeader: `ваши активные предупреждения (за последние 7 дней):`,
    yourWarnsNone: `у вас нет активных предупреждений`,
    noMemberOnServer: (idOrMention) => `пользователь ${idOrMention} не найден на сервере`,
    notInBanlist: (id) => `пользователь с id ${id} отсутствует в банлисте`,
    maxLevel: (u) => `у пользователя ${u} уже максимальный уровень`,
    minLevel: (u) => `у пользователя ${u} уже минимальный уровень`,
  };

  function isServerOwner() {
    return message.member.id === message.guild.ownerId;
  }

  function canUse(levelRequired) {
    return level >= levelRequired || isServerOwner();
  }

  const isAdminProtected = async (member) => await getLevel(member.id) === 3;

  // Команда генерации ключа
  if (cmd === '/generatekey') {
    if (!canUse(3)) return message.reply(t.noPerm);
    
    try {
      // Генерируем уникальный ключ
      const key = await generateUniqueKey();
      
      // Сохраняем ключ в базу
      const saved = await saveGeneratedKey(key, message.author.id);
      
      if (saved) {
        // Отправляем ключ в ЛС автору команды
        try {
          await message.author.send(`✅ Сгенерирован новый ключ:\n\`${key}\`\n\nКлюч сохранен в базе данных.`);
          await message.reply('✅ Ключ сгенерирован и отправлен вам в личные сообщения.');
        } catch (dmError) {
          await message.reply('❌ Не удалось отправить ключ в ЛС. Проверьте настройки приватности.');
        }
      } else {
        await message.reply('❌ Ошибка при сохранении ключа в базу данных.');
      }
    } catch (error) {
      console.error('Error generating key:', error);
      await message.reply('❌ Произошла ошибка при генерации ключа.');
    }
    return;
  }

  if (cmd === '!ping' || cmd === '!пинг') {
    return message.reply('понг! бот работает');
  }

  if (cmd === '!hello' || cmd === '!привет') {
    return message.reply(`привет ${message.author.username}`);
  }

  if (cmd === '!banlist' || cmd === '!банлист') {
    if (!canUse(2)) return message.reply(t.noPerm);
    const bans = await message.guild.bans.fetch();
    if (bans.size === 0) return message.reply(t.banListEmpty);
    const list = bans.map(b => `${b.user.tag} (id: ${b.user.id})`).join('\n');
    return message.reply(`забаненные пользователи:\n${list}`);
  }

  if (cmd === '!ban' || cmd === '!бан') {
    if (!canUse(2)) return message.reply(t.noPerm);
    const mentionedUser = message.mentions.members.first() || (args[0] ? message.guild.members.cache.get(args[0]) : null);
    if (!mentionedUser) return message.reply(t.noMemberOnServer(args[0] || ''));
    const reason = args.slice(1).join(' ') || 'без причины';
    if (!mentionedUser.bannable || await isAdminProtected(mentionedUser))
      return message.reply('невозможно забанить этого пользователя');
    await mentionedUser.ban({ reason });
    return message.reply(t.banned(mentionedUser.user.tag, reason));
  }

  if (cmd === '!kick' || cmd === '!кик') {
    if (!canUse(1)) return message.reply(t.noPerm);
    const mentionedUser =
      message.mentions.members.first() ||
      (args[0] ? message.guild.members.cache.get(args[0].replace(/[<@!>]/g, '')) : null);
    if (!mentionedUser) return message.reply(t.noMemberOnServer(args[0] || ''));
    if (!mentionedUser.kickable || await isAdminProtected(mentionedUser))
      return message.reply('невозможно кикнуть этого пользователя');
    const reason = args.slice(1).join(' ') || 'без причины';
    await mentionedUser.kick(reason);
    return message.reply(t.kicked(`${mentionedUser.user.tag} (причина: ${reason})`));
  }

  if (cmd === '!mute' || cmd === '!мут') {
    if (!canUse(1)) return message.reply(t.noPerm);

    const mentionedUser =
      message.mentions.members.first() ||
      (args[0] ? message.guild.members.cache.get(args[0].replace(/[<@!>]/g, '')) : null);

    if (!mentionedUser) return message.reply(t.noMemberOnServer(args[0] || ''));

    const restArgs = args.slice(1);
    let durationParsed = parseDurationFromTokens(restArgs, 0);
    let duration = durationParsed?.ms;

    if (!duration || !Number.isFinite(duration) || duration <= 0) {
      duration = 60 * 60 * 1000;
    }

    if (duration > 2419200000) duration = 2419200000;

    const humanDuration =
      durationParsed?.human && Number.isFinite(durationParsed.ms)
        ? durationParsed.human
        : formatHumanDuration(1, 'hours');

    const restString = restArgs.join(' ');
    const reasonString = restString.replace(
      /\b\d+(?:[\.,]?\d*)?\s*(?:с|сек|секунд|секунда|секунды|s|sec|seconds?|м|мин|минут|minutes?|h|час|ч|часа|часов|d|дн|день|дня|дней)(?:\s*\d+\s*(?:с|сек|секунд|секунда|секунды|s|sec|seconds?|м|мин|минут|minutes?|h|час|ч|часа|часов|d|дн|день|дня|дней))*/gi,
      ''
    ).trim();

    const reason = reasonString || 'без причины';

    if (!mentionedUser.moderatable || await isAdminProtected(mentionedUser))
      return message.reply('невозможно замутить этого пользователя');

    try {
      await mentionedUser.timeout(duration, reason);
      return message.reply(t.muted(mentionedUser.user.tag, humanDuration, reason));
    } catch (err) {
      console.error('mute error:', err);
      return message.reply('ошибка при выдаче мута. убедитесь, что у бота есть права и корректное время.');
    }
  }

  if (cmd === '!unmute' || cmd === '!снятьмут') {
    if (!canUse(1)) return message.reply(t.noPerm);

    const mentionedUser =
      message.mentions.members.first() ||
      (args[0] ? message.guild.members.cache.get(args[0].replace(/[<@!>]/g, '')) : null);

    if (!mentionedUser) return message.reply(t.noMemberOnServer(args[0] || ''));

    if (!mentionedUser.isCommunicationDisabled()) {
      return message.reply(`пользователь ${mentionedUser.user.tag} не замучен`);
    }

    try {
      await mentionedUser.timeout(null);
      return message.reply(t.unmuted(mentionedUser.user.tag));
    } catch (err) {
      console.error('unmute error:', err);
      return message.reply('не удалось снять мут. проверьте права бота.');
    }
  }

  if (cmd === '!warn' || cmd === '!варн') {
    if (!canUse(1)) return message.reply(t.noPerm);
    const mentionedUser = message.mentions.members.first() || (args[0] ? message.guild.members.cache.get(args[0].replace(/[<@!>]/g, '')) : null);
    if (!mentionedUser) return message.reply(t.noMemberOnServer(args[0] || ''));
    const reason = args.slice(1).join(' ') || 'без причины';
    
    // Добавляем варн в базу
    await addWarn(mentionedUser.id, reason);
    
    // Получаем все варны пользователя
    const warns = await getUserWarns(mentionedUser.id);

    if (warns.length >= 3) {
      await mentionedUser.ban({ reason: '3 предупреждения за 7 дней' });
      await clearUserWarns(mentionedUser.id);
      return message.reply(`пользователь ${mentionedUser.user.tag} получил 3 предупреждения за 7 дней и был забанен`);
    }

    return message.reply(t.warned(mentionedUser.user.tag, warns.length, reason));
  }

  if (cmd === '!warns' || cmd === '!варны') {
    const warns = await getUserWarns(message.author.id);

    if (warns.length === 0) {
      try {
        await message.author.send(t.yourWarnsNone);
        return message.reply('предупреждения отправлены в лс');
      } catch {
        return message.reply('не удалось отправить сообщение в лс');
      }
    }

    const list = warns.map((w, i) => `${i + 1}. ${w.reason} (${new Date(w.created_at).toLocaleDateString()})`).join('\n');
    try {
      await message.author.send(`${t.yourWarnsHeader}\n${list}`);
      return message.reply('предупреждения отправлены в лс');
    } catch {
      return message.reply('не удалось отправить сообщение в лс');
    }
  }

  if (cmd === '!level' || cmd === '!уровень') {
    try {
      await message.author.send(t.yourLevel(level));
      return message.reply('уровень отправлен в лс');
    } catch {
      return message.reply('не удалось отправить сообщение в лс');
    }
  }

  if (cmd === '!help' || cmd === '!команды') {
    const text = `
команды:
!пинг — проверить работу
!привет — приветствие
!мут @user [длительность] [причина]
!снятьмут @user
!кик @user [причина]
!бан @user [причина]
!разбан id
!банлист
!варн @user [причина]
!варны — показать свои предупреждения
!повысить @user
!понизить @user
!уровень — показать уровень
/generatekey — сгенерировать ключ (только для админов)
    `;
    return message.reply(text);
  }

  if (cmd === '!unban' || cmd === '!разбан') {
    if (!canUse(2)) return message.reply(t.noPerm);
    const id = args[0];
    if (!id) return message.reply('укажите id для разбана');
    const bans = await message.guild.bans.fetch();
    const found = bans.get(id);
    if (!found) return message.reply(t.notInBanlist(id));
    await message.guild.members.unban(id);
    return message.reply(t.unbanned(found.user.tag));
  }

  if (cmd === '!повысить' || cmd === '!promote') {
    if (!canUse(3)) return message.reply(t.noPerm);
    const mentionedUser = message.mentions.members.first() || (args[0] ? message.guild.members.cache.get(args[0]) : null);
    if (!mentionedUser) return message.reply(t.mentionUser);
    const currentLevel = await getLevel(mentionedUser.id);
    if (currentLevel >= 3) return message.reply(t.maxLevel(mentionedUser.user.tag));
    const newLevel = currentLevel + 1;
    await setLevel(mentionedUser.id, newLevel);
    return message.reply(t.promote(mentionedUser.user.tag, newLevel));
  }

  if (cmd === '!понизить' || cmd === '!demote') {
    if (!canUse(3)) return message.reply(t.noPerm);
    const mentionedUser = message.mentions.members.first() || (args[0] ? message.guild.members.cache.get(args[0]) : null);
    if (!mentionedUser) return message.reply(t.mentionUser);
    const currentLevel = await getLevel(mentionedUser.id);
    if (currentLevel <= 0) return message.reply(t.minLevel(mentionedUser.user.tag));
    const newLevel = currentLevel - 1;
    await setLevel(mentionedUser.id, newLevel);
    return message.reply(t.demote(mentionedUser.user.tag, newLevel));
  }

});

client.on('error', (err) => console.error('discord client error:', err));
process.on('unhandledRejection', (err) => console.error('unhandled error:', err));

// Запускаем бота
client.login(process.env.DISCORD_TOKEN).catch(err => console.error('auth error:', err.message));

// Экспортируем функцию для Vercel
module.exports = (req, res) => {
  res.status(200).send('Discord Bot is running!');
};
