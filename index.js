require('dotenv').config();
const { Client, GatewayIntentBits, Events, PermissionFlagsBits } = require('discord.js');
const { createClient } = require('@supabase/supabase-js');

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
    GatewayIntentBits.GuildMessageReactions,
  ],
  partials: ['CHANNEL', 'MESSAGE', 'REACTION'],
});

// Разрешенные каналы для модерационных команд
const moderationChannels = [
  '1424337548439982203', // модерация 1
  '1430559148935745666', // модерация 2
  '1424338039181676730', // модерация 3
  '1424338237559930941', // модерация 4
];

// Канал для команд помощи
const HELP_CHANNEL_ID = '1430527389892612186';

// Канал для верификации
const VERIFICATION_CHANNEL_ID = '1424339843655401582';

// Канал для приветствий
const WELCOME_CHANNEL_ID = '1424339559159824487';

const officialReplyRu = 'я могу отвечать только в официальных каналах сервера.';
const officialReplyEn = 'i can only respond in the official server channels.';

// Функция генерации уникального ключа
function generateUniqueKey() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const segments = [5, 6, 5];
  let key = 'VERYUP-';
  
  for (let i = 0; i < segments.length; i++) {
    for (let j = 0; j < segments[i]; j++) {
      key += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    if (i < segments.length - 1) {
      key += '-';
    }
  }
  
  return key;
}

// Функция парсинга длительности
function parseDuration(durationStr) {
  if (!durationStr) return null;
  
  const regex = /^(\d+)([dhm])$/i;
  const match = durationStr.match(regex);
  
  if (!match) return null;
  
  const amount = parseInt(match[1]);
  const unit = match[2].toLowerCase();
  
  switch (unit) {
    case 'd':
      return { 
        interval: `${amount} days`, 
        milliseconds: amount * 24 * 60 * 60 * 1000,
        human: `${amount} ${getRussianDays(amount)}`
      };
    case 'h':
      return { 
        interval: `${amount} hours`, 
        milliseconds: amount * 60 * 60 * 1000,
        human: `${amount} ${getRussianHours(amount)}`
      };
    case 'm':
      return { 
        interval: `${amount} minutes`, 
        milliseconds: amount * 60 * 1000,
        human: `${amount} ${getRussianMinutes(amount)}`
      };
    default:
      return null;
  }
}

// Вспомогательные функции для русских склонений
function getRussianDays(number) {
  if (number % 10 === 1 && number % 100 !== 11) return 'день';
  if ([2, 3, 4].includes(number % 10) && !(number % 100 >= 12 && number % 100 <= 14)) return 'дня';
  return 'дней';
}

function getRussianHours(number) {
  if (number % 10 === 1 && number % 100 !== 11) return 'час';
  if ([2, 3, 4].includes(number % 10) && !(number % 100 >= 12 && number % 100 <= 14)) return 'часа';
  return 'часов';
}

function getRussianMinutes(number) {
  if (number % 10 === 1 && number % 100 !== 11) return 'минута';
  if ([2, 3, 4].includes(number % 10) && !(number % 100 >= 12 && number % 100 <= 14)) return 'минуты';
  return 'минут';
}

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
async function generateAndSaveKey(userId, durationStr = null) {
  try {
    let key;
    let isUnique = false;
    let attempts = 0;
    const maxAttempts = 10;

    // Парсим длительность
    let durationInfo = null;
    let expiresAt = null;
    let expired = false;
    
    if (durationStr) {
      durationInfo = parseDuration(durationStr);
      if (!durationInfo) {
        throw new Error('Неверный формат длительности. Используйте: 1d, 2h, 30m');
      }
      expiresAt = new Date(Date.now() + durationInfo.milliseconds).toISOString();
      expired = false;
    }

    // Генерируем ключ пока не найдем уникальный
    while (!isUnique && attempts < maxAttempts) {
      key = generateUniqueKey();
      
      const { data: existingKey, error: checkError } = await supabase
        .from('activation_keys')
        .select('key')
        .eq('key', key)
        .single();

      if (checkError && checkError.code === 'PGRST116') {
        isUnique = true;
      } else if (!checkError && existingKey) {
        attempts++;
      } else {
        console.error('Error checking key uniqueness:', checkError);
        attempts++;
      }
    }

    if (!isUnique) {
      throw new Error('Could not generate unique key after multiple attempts');
    }

    // Сохраняем ключ в базу
    const { error: insertError } = await supabase
      .from('activation_keys')
      .insert({
        key: key,
        created_by: userId,
        created_at: new Date().toISOString(),
        is_used: false,
        duration: durationInfo ? durationInfo.interval : null,
        expires_at: expiresAt,
        expired: expired
      });

    if (insertError) {
      console.error('Error saving key:', insertError);
      throw new Error('Failed to save key to database');
    }

    return { key, durationInfo };
  } catch (error) {
    console.error('Error in generateAndSaveKey:', error);
    throw error;
  }
}

async function getGeneratedKeys(userId) {
  try {
    const { data, error } = await supabase
      .from('activation_keys')
      .select('key, created_at, is_used, duration, expires_at, expired')
      .eq('created_by', userId)
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      console.error('Error getting keys:', error);
      return [];
    }
    return data || [];
  } catch (error) {
    console.error('Error getting keys:', error);
    return [];
  }
}

// НОВАЯ ФУНКЦИЯ: Логирование модерационных действий
async function logModAction(action, moderatorId, targetUserId, reason = null, duration = null, successful = true) {
  try {
    const { error } = await supabase
      .from('moderation_logs')
      .insert({
        action: action,
        moderator_id: moderatorId,
        target_user_id: targetUserId,
        reason: reason || 'без причины',
        duration: duration,
        successful: successful,
        created_at: new Date().toISOString()
      });

    if (error) {
      console.error('Error logging mod action:', error);
    }
  } catch (error) {
    console.error('Error in logModAction:', error);
  }
}

// НОВАЯ ФУНКЦИЯ: Автоочистка старых варнов
async function cleanupOldWarns() {
  try {
    const { error } = await supabase
      .from('user_warns')
      .delete()
      .lt('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

    if (error) {
      console.error('Error cleaning up old warns:', error);
    } else {
      console.log('Old warns cleanup completed');
    }
  } catch (error) {
    console.error('Error in cleanupOldWarns:', error);
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

// НОВАЯ ФУНКЦИЯ: Создание сообщения для верификации
async function createVerificationMessage(channel) {
  try {
    const embed = {
      title: '🔐 Верификация',
      description: 'Для доступа к серверу нажмите на реакцию ✅ ниже',
      color: 0x00ff00,
      timestamp: new Date().toISOString(),
      footer: {
        text: 'Система верификации'
      }
    };

    const message = await channel.send({ 
      content: '**Верификация**',
      embeds: [embed] 
    });
    
    await message.react('✅');
    console.log('Verification message created with ID:', message.id);
    return message.id;
  } catch (error) {
    console.error('Error creating verification message:', error);
    throw error;
  }
}

// НОВАЯ ФУНКЦИЯ: Найти или создать роль Verified
async function findOrCreateVerifiedRole(guild) {
  try {
    // Ищем существующую роль
    let verifiedRole = guild.roles.cache.find(role => 
      role.name === 'Verified' || 
      role.name === 'Верифицирован'
    );

    if (!verifiedRole) {
      // Создаем новую роль с правильной позицией
      verifiedRole = await guild.roles.create({
        name: 'Verified',
        color: 'GREEN',
        reason: 'Роль для верифицированных пользователей',
        permissions: []
      });
      
      // Перемещаем роль выше роли бота
      const botMember = await guild.members.fetch(client.user.id);
      const botRole = botMember.roles.highest;
      
      if (verifiedRole.position <= botRole.position) {
        await verifiedRole.setPosition(botRole.position - 1);
      }
      
      console.log('Created Verified role:', verifiedRole.id);
    }

    return verifiedRole;
  } catch (error) {
    console.error('Error finding/creating Verified role:', error);
    throw error;
  }
}

// НОВАЯ ФУНКЦИЯ: Найти или создать роль Unverified
async function findOrCreateUnverifiedRole(guild) {
  try {
    // Ищем существующую роль
    let unverifiedRole = guild.roles.cache.find(role => 
      role.name === 'Unverified' || 
      role.name === 'Неверифицирован'
    );

    if (!unverifiedRole) {
      // Создаем новую роль
      unverifiedRole = await guild.roles.create({
        name: 'Unverified',
        color: 'GREY',
        reason: 'Роль для новых пользователей',
        permissions: []
      });
      console.log('Created Unverified role:', unverifiedRole.id);
    }

    return unverifiedRole;
  } catch (error) {
    console.error('Error finding/creating Unverified role:', error);
    throw error;
  }
}

client.once(Events.ClientReady, async (c) => {
  console.log(`bot started: ${c.user.tag}`);
  console.log('using supabase for data storage');
  console.log('commands: !ping, !ban, !kick, !mute, !unmute, !unban, !warn, !warns, !help, !повысить, !понизить, /generatekey, /setupverify');

  const guilds = client.guilds.cache;
  for (const [guildId, guild] of guilds) {
    const owner = await guild.fetchOwner();
    await setLevel(owner.id, 3);
    
    // Автоматически создаем роли при запуске бота
    try {
      await findOrCreateVerifiedRole(guild);
      await findOrCreateUnverifiedRole(guild);
      console.log(`Roles created/verified for guild: ${guild.name}`);
    } catch (error) {
      console.error(`Error setting up roles for guild ${guild.name}:`, error);
    }
  }

  // Запускаем автоочистку каждые 24 часа
  setInterval(cleanupOldWarns, 24 * 60 * 60 * 1000);
  console.log('Auto-cleanup for warns scheduled every 24 hours');
});

// Обработчик входа нового пользователя
client.on(Events.GuildMemberAdd, async (member) => {
  try {
    console.log(`New member joined: ${member.user.tag}`);
    
    // Находим или создаем роль Unverified
    const unverifiedRole = await findOrCreateUnverifiedRole(member.guild);
    
    // Выдаем роль Unverified
    await member.roles.add(unverifiedRole);
    console.log(`Assigned Unverified role to ${member.user.tag}`);
    
    // Отправляем приветственное сообщение в правильный канал
    const welcomeChannel = member.guild.channels.cache.get(WELCOME_CHANNEL_ID);
    
    if (welcomeChannel) {
      await welcomeChannel.send(`привет ${member.user}! добро пожаловать на сервер! пожалуйста, пройдите верификацию в канале <#${VERIFICATION_CHANNEL_ID}>`);
    } else {
      console.error('Welcome channel not found:', WELCOME_CHANNEL_ID);
    }
    
  } catch (error) {
    console.error('Error handling new member:', error);
  }
});

// Обработчик реакций для верификации
client.on(Events.MessageReactionAdd, async (reaction, user) => {
  try {
    // Проверяем, что это не реакция бота
    if (user.bot) return;
    
    // Проверяем, что реакция в нужном канале
    if (reaction.message.channel.id !== VERIFICATION_CHANNEL_ID) return;
    
    // Проверяем, что это нужная реакция
    if (reaction.emoji.name !== '✅') return;
    
    const member = reaction.message.guild.members.cache.get(user.id);
    if (!member) {
      console.log('Member not found for user:', user.id);
      return;
    }
    
    console.log(`Processing verification for user: ${user.tag}`);
    
    // Находим роли
    const verifiedRole = await findOrCreateVerifiedRole(reaction.message.guild);
    const unverifiedRole = await findOrCreateUnverifiedRole(reaction.message.guild);
    
    console.log('Found roles:', {
      verified: verifiedRole?.name,
      unverified: unverifiedRole?.name
    });
    
    // Проверяем иерархию ролей
    const botMember = await reaction.message.guild.members.fetch(client.user.id);
    if (verifiedRole.position >= botMember.roles.highest.position) {
      console.error('Bot cannot assign Verified role - hierarchy issue');
      try {
        await user.send('ошибка, свяжитесь с администрацией');
      } catch (dmError) {
        console.log('cannot send dm to user about hierarchy issue');
      }
      return;
    }
    
    // Удаляем роль Unverified
    if (unverifiedRole && member.roles.cache.has(unverifiedRole.id)) {
      try {
        await member.roles.remove(unverifiedRole);
        console.log(`removed Unverified role from ${user.tag}`);
      } catch (error) {
        console.error('error removing Unverified role:', error);
      }
    }
    
    // Добавляем роль Verified
    try {
      await member.roles.add(verifiedRole);
      console.log(`Added Verified role to ${user.tag}`);
      
      // Отправляем сообщение об успешной верификации
      try {
        await user.send('ты был верефицирован');
      } catch (dmError) {
        console.log('Cannot send DM to user:', dmError);
      }
      
    } catch (error) {
      console.error('Error adding Verified role:', error);
      try {
        await user.send('❌ Ошибка при выдаче роли Verified. Пожалуйста, сообщите администраторам.');
      } catch (dmError) {
        console.log('Cannot send DM to user about role error');
      }
    }
    
  } catch (error) {
    console.error('Error handling verification reaction:', error);
  }
});

// Обработчик удаления реакций (если пользователь убирает реакцию галочки)
client.on(Events.MessageReactionRemove, async (reaction, user) => {
  try {
    if (user.bot) return;
    if (reaction.message.channel.id !== VERIFICATION_CHANNEL_ID) return;
    if (reaction.emoji.name !== '✅') return;
    
    const member = reaction.message.guild.members.cache.get(user.id);
    if (!member) return;
    
    const verifiedRole = await findOrCreateVerifiedRole(reaction.message.guild);
    const unverifiedRole = await findOrCreateUnverifiedRole(reaction.message.guild);
    
    // Если убрали реакцию, убираем Verified и возвращаем Unverified
    if (member.roles.cache.has(verifiedRole.id)) {
      await member.roles.remove(verifiedRole);
      console.log(`Removed Verified role from ${user.tag} (reaction removed)`);
    }
    
    // Добавляем роль Unverified обратно
    if (unverifiedRole && !member.roles.cache.has(unverifiedRole.id)) {
      await member.roles.add(unverifiedRole);
      console.log(`Added Unverified role back to ${user.tag} (reaction removed)`);
      
      // Уведомляем пользователя
      try {
        await user.send('верефикация отмененна');
      } catch (dmError) {
        console.log('Cannot send DM to user about verification cancellation');
      }
    }
    
  } catch (error) {
    console.error('Error handling reaction remove:', error);
  }
});

// Обработчик выхода пользователя с сервера
client.on(Events.GuildMemberRemove, async (member) => {
  try {
    console.log(`User left: ${member.user.tag} (${member.user.id})`);
    
    // Отправляем сообщение о выходе пользователя
    const welcomeChannel = member.guild.channels.cache.get(WELCOME_CHANNEL_ID);
    
    if (welcomeChannel) {
      // Создаем красивое сообщение о выходе
      const leaveEmbed = {
        color: 0xff0000,
        title: '🚪 Пользователь покинул сервер',
        description: `**${member.user.tag}** (${member.user.id})`,
        thumbnail: {
          url: member.user.displayAvatarURL({ dynamic: true })
        },
        fields: [
          {
            name: 'Присоединился',
            value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`,
            inline: true
          },
          {
            name: 'Аккаунт создан',
            value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`,
            inline: true
          }
        ],
        timestamp: new Date().toISOString(),
        footer: {
          text: `ID: ${member.user.id}`
        }
      };
      
      await welcomeChannel.send({ 
        content: `пользователь **${member.user.tag}** покинул сервер! 👋`,
        embeds: [leaveEmbed] 
      });
      
      console.log(`Leave message sent for ${member.user.tag}`);
    } else {
      console.error('Welcome channel not found for leave message:', WELCOME_CHANNEL_ID);
    }
    
  } catch (error) {
    console.error('Error handling member leave:', error);
  }
});

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;

  if (!message.guild) {
    const isRussian = /[а-яё]/i.test(message.content);
    return message.reply(isRussian ? officialReplyRu : officialReplyEn);
  }

  const parts = message.content.trim().split(/\s+/);
  if (parts.length === 0) return;
  const cmd = parts[0].toLowerCase();
  const args = parts.slice(1);

  const content = message.content.trim();
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

  // Проверка каналов для команд помощи
  const isHelpChannel = message.channel.id === HELP_CHANNEL_ID;
  const isModerationChannel = moderationChannels.includes(message.channel.id);

  // Команды помощи работают только в HELP_CHANNEL_ID
  if ((cmd === '!help' || cmd === '!команды') && !isHelpChannel) {
    return; // Игнорируем команду в других каналах
  }

  // Модерационные команды работают только в moderationChannels
  const moderationCommands = [
    '!ban', '!бан', '!kick', '!кик', '!mute', '!мут', 
    '!unmute', '!снятьмут', '!warn', '!варн', '!unban', 
    '!разбан', '!banlist', '!банлист', '!warns', '!варны',
    '!повысить', '!promote', '!понизить', '!demote'
  ];

  if (moderationCommands.includes(cmd) && !isModerationChannel) {
    return; // Игнорируем модерационные команды в других каналах
  }

  // Команда настройки верификации
  if (cmd === '/setupverify') {
    if (!canUse(3)) {
      try {
        await message.author.send('у вас нет прав для настройки верификации');
        return;
      } catch {
        return;
      }
    }

    try {
      const channel = message.guild.channels.cache.get(VERIFICATION_CHANNEL_ID);
      if (!channel) {
        return message.reply('канал для верификации не найден');
      }

      await createVerificationMessage(channel);
      await message.reply('сообщение для верификации создано!');
      
    } catch (error) {
      console.error('Error setting up verification:', error);
      await message.reply('ошибка при создании сообщения верификации');
    }
    return;
  }

  // Команда генерации ключа
  if (cmd === '/generatekey') {
    if (!canUse(3)) {
      try {
        await message.author.send('у вас нет прав для генерации ключей');
        return;
      } catch {
        return;
      }
    }

    try {
      const durationStr = args[0] || null;
      const { key, durationInfo } = await generateAndSaveKey(message.author.id, durationStr);
      
      let keyMessage = `сгенерирован ключ: ${key}`;
      if (durationInfo) {
        keyMessage += `\nсрок действия: ${durationInfo.human}`;
        const expiresDate = new Date(Date.now() + durationInfo.milliseconds);
        keyMessage += `\nистекает: ${expiresDate.toLocaleString('ru-RU')}`;
        keyMessage += `\nстатус: активен`;
      } else {
        keyMessage += `\nсрок действия: бессрочный`;
        keyMessage += `\nстатус: активен`;
      }
      
      try {
        await message.author.send(keyMessage);
        await message.reply('ключ сгенерирован и отправлен в лс');
      } catch (dmError) {
        console.error('Cannot send DM:', dmError);
        await message.reply('не удалось отправить ключ в лс. проверьте настройки приватности');
      }
    } catch (error) {
      console.error('Key generation error:', error);
      try {
        await message.author.send(`ошибка при генерации ключа: ${error.message}`);
      } catch {
      }
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
    if (!mentionedUser.bannable || await isAdminProtected(mentionedUser)) {
      await logModAction('ban', message.author.id, mentionedUser.id, reason, null, false);
      return message.reply('невозможно забанить этого пользователя');
    }
    await mentionedUser.ban({ reason });
    await logModAction('ban', message.author.id, mentionedUser.id, reason);
    return message.reply(t.banned(mentionedUser.user.tag, reason));
  }

  if (cmd === '!kick' || cmd === '!кик') {
    if (!canUse(1)) return message.reply(t.noPerm);
    const mentionedUser =
      message.mentions.members.first() ||
      (args[0] ? message.guild.members.cache.get(args[0].replace(/[<@!>]/g, '')) : null);
    if (!mentionedUser) return message.reply(t.noMemberOnServer(args[0] || ''));
    if (!mentionedUser.kickable || await isAdminProtected(mentionedUser)) {
      await logModAction('kick', message.author.id, mentionedUser.id, args.slice(1).join(' ') || 'без причины', null, false);
      return message.reply('невозможно кикнуть этого пользователя');
    }
    const reason = args.slice(1).join(' ') || 'без причины';
    await mentionedUser.kick(reason);
    await logModAction('kick', message.author.id, mentionedUser.id, reason);
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

    if (!mentionedUser.moderatable || await isAdminProtected(mentionedUser)) {
      await logModAction('mute', message.author.id, mentionedUser.id, reason, humanDuration, false);
      return message.reply('невозможно замутить этого пользователя');
    }

    try {
      await mentionedUser.timeout(duration, reason);
      await logModAction('mute', message.author.id, mentionedUser.id, reason, humanDuration);
      return message.reply(t.muted(mentionedUser.user.tag, humanDuration, reason));
    } catch (err) {
      console.error('mute error:', err);
      await logModAction('mute', message.author.id, mentionedUser.id, reason, humanDuration, false);
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
      await logModAction('unmute', message.author.id, mentionedUser.id, null, null, false);
      return message.reply(`пользователь ${mentionedUser.user.tag} не замучен`);
    }

    try {
      await mentionedUser.timeout(null);
      await logModAction('unmute', message.author.id, mentionedUser.id);
      return message.reply(t.unmuted(mentionedUser.user.tag));
    } catch (err) {
      console.error('unmute error:', err);
      await logModAction('unmute', message.author.id, mentionedUser.id, null, null, false);
      return message.reply('не удалось снять мут. проверьте права бота.');
    }
  }

  if (cmd === '!warn' || cmd === '!варн') {
    if (!canUse(1)) return message.reply(t.noPerm);
    const mentionedUser = message.mentions.members.first() || (args[0] ? message.guild.members.cache.get(args[0].replace(/[<@!>]/g, '')) : null);
    if (!mentionedUser) return message.reply(t.noMemberOnServer(args[0] || ''));
    const reason = args.slice(1).join(' ') || 'без причины';
    
    await addWarn(mentionedUser.id, reason);
    await logModAction('warn', message.author.id, mentionedUser.id, reason);
    
    const warns = await getUserWarns(mentionedUser.id);

    if (warns.length >= 3) {
      await mentionedUser.ban({ reason: '3 предупреждения за 7 дней' });
      await clearUserWarns(mentionedUser.id);
      await logModAction('ban', 'auto-system', mentionedUser.id, '3 предупреждения за 7 дней');
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
/generatekey [время] — сгенерировать ключ (только для админов)
    примеры времени: 1d, 2h, 30m
/setupverify — создать сообщение для верификации (только для админов)
    `;
    return message.reply(text);
  }

  if (cmd === '!unban' || cmd === '!разбан') {
    if (!canUse(2)) return message.reply(t.noPerm);
    const id = args[0];
    if (!id) return message.reply('укажите id для разбана');
    const bans = await message.guild.bans.fetch();
    const found = bans.get(id);
    if (!found) {
      await logModAction('unban', message.author.id, id, null, null, false);
      return message.reply(t.notInBanlist(id));
    }
    await message.guild.members.unban(id);
    await logModAction('unban', message.author.id, id);
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
    await logModAction('promote', message.author.id, mentionedUser.id, `уровень ${currentLevel} -> ${newLevel}`);
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
    await logModAction('demote', message.author.id, mentionedUser.id, `уровень ${currentLevel} -> ${newLevel}`);
    return message.reply(t.demote(mentionedUser.user.tag, newLevel));
  }
});

client.login(process.env.DISCORD_TOKEN);
