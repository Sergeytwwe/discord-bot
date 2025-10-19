require('dotenv').config();
const { Client, GatewayIntentBits, Events } = require('discord.js');

console.log('starting bot with moderation commands...');

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

const userLevels = new Map();
const userWarns = new Map();

function getLevel(userId) {
  return userLevels.get(userId) || 0;
}

function setLevel(userId, level) {
  userLevels.set(userId, level);
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
  console.log('commands: !ping, !ban, !kick, !mute, !unmute, !unban, !warn, !warns, !help, !повысить, !понизить');

  const guilds = client.guilds.cache;
  for (const [guildId, guild] of guilds) {
    const owner = await guild.fetchOwner();
    setLevel(owner.id, 3);
  }
});

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;

  if (!message.guild) {
    const isRussian = /[а-яё]/i.test(message.content);
    return message.reply(isRussian ? officialReplyRu : officialReplyEn);
  }

  if (!allowedChannels.includes(message.channel.id)) return;

  const parts = message.content.trim().split(/\s+/);
  if (parts.length === 0) return;
  const cmd = parts[0].toLowerCase();
  const args = parts.slice(1);

  const content = message.content.trim();
  const isRussian = /[а-яё]/i.test(content);
  const lang = isRussian ? 'ru' : 'en';
  const level = getLevel(message.author.id);

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

  const isAdminProtected = (member) => getLevel(member.id) === 3;

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
    if (!mentionedUser.bannable || isAdminProtected(mentionedUser))
      return message.reply('невозможно забанить этого пользователя');
    await mentionedUser.ban({ reason });
    return message.reply(t.banned(mentionedUser.user.tag, reason));
  }

  // ✅ kick с причиной
  if (cmd === '!kick' || cmd === '!кик') {
    if (!canUse(1)) return message.reply(t.noPerm);
    const mentionedUser =
      message.mentions.members.first() ||
      (args[0] ? message.guild.members.cache.get(args[0].replace(/[<@!>]/g, '')) : null);
    if (!mentionedUser) return message.reply(t.noMemberOnServer(args[0] || ''));
    if (!mentionedUser.kickable || isAdminProtected(mentionedUser))
      return message.reply('невозможно кикнуть этого пользователя');
    const reason = args.slice(1).join(' ') || 'без причины';
    await mentionedUser.kick(reason);
    return message.reply(t.kicked(`${mentionedUser.user.tag} (причина: ${reason})`));
  }

// =================== !mute / !мут ===================
if (cmd === '!mute' || cmd === '!мут') {
  if (!canUse(1)) return message.reply(t.noPerm);

  const mentionedUser =
    message.mentions.members.first() ||
    (args[0] ? message.guild.members.cache.get(args[0].replace(/[<@!>]/g, '')) : null);

  if (!mentionedUser) return message.reply(t.noMemberOnServer(args[0] || ''));

  // --- отделяем аргументы после упоминания ---
  const restArgs = args.slice(1);

  // --- корректная обработка времени ---
  let durationParsed = parseDurationFromTokens(restArgs, 0);
  let duration = durationParsed?.ms;

  // если парсер ничего не нашёл или вернул ерунду — ставим 1 час
  if (!duration || !Number.isFinite(duration) || duration <= 0) {
    duration = 60 * 60 * 1000; // 1 час
  }

  // Discord API не принимает >28 дней
  if (duration > 2419200000) duration = 2419200000;

  // если парсер ничего не вернул — делаем красивую строку вручную
  const humanDuration =
    durationParsed?.human && Number.isFinite(durationParsed.ms)
      ? durationParsed.human
      : formatHumanDuration(1, 'hours');

  // --- извлечение причины ---
  // объединяем все аргументы в строку
  const restString = restArgs.join(' ');

  // удаляем из строки все временные выражения (русские и английские)
  const reasonString = restString.replace(
    /\b\d+(?:[\.,]?\d*)?\s*(?:с|сек|секунд|секунда|секунды|s|sec|seconds?|м|мин|минут|minutes?|h|час|ч|часа|часов|d|дн|день|дня|дней)(?:\s*\d+\s*(?:с|сек|секунд|секунда|секунды|s|sec|seconds?|м|мин|минут|minutes?|h|час|ч|часа|часов|d|дн|день|дня|дней))*/gi,
    ''
  ).trim();

  const reason = reasonString || 'без причины';

  if (!mentionedUser.moderatable || isAdminProtected(mentionedUser))
    return message.reply('невозможно замутить этого пользователя');

  try {
    await mentionedUser.timeout(duration, reason);
    return message.reply(t.muted(mentionedUser.user.tag, humanDuration, reason));
  } catch (err) {
    console.error('mute error:', err);
    return message.reply('ошибка при выдаче мута. убедитесь, что у бота есть права и корректное время.');
  }
}

// =================== !unmute / !снятьмут ===================
if (cmd === '!unmute' || cmd === '!снятьмут') {
  if (!canUse(1)) return message.reply(t.noPerm);

  const mentionedUser =
    message.mentions.members.first() ||
    (args[0] ? message.guild.members.cache.get(args[0].replace(/[<@!>]/g, '')) : null);

  if (!mentionedUser) return message.reply(t.noMemberOnServer(args[0] || ''));

  // Проверяем, есть ли у пользователя активный мут
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
    const now = Date.now();
    let warns = userWarns.get(mentionedUser.id) || [];
    warns = warns.filter(w => now - w.timestamp < 7 * 24 * 60 * 60 * 1000);
    warns.push({ timestamp: now, reason });
    userWarns.set(mentionedUser.id, warns);

    if (warns.length >= 3) {
      await mentionedUser.ban({ reason: '3 warns in 7 days' });
      userWarns.delete(mentionedUser.id);
      return message.reply(`пользователь ${mentionedUser.user.tag} получил 3 предупреждения за 7 дней и был забанен`);
    }

    return message.reply(t.warned(mentionedUser.user.tag, warns.length, reason));
  }

  if (cmd === '!warns' || cmd === '!варны') {
    const now = Date.now();
    let warns = userWarns.get(message.author.id) || [];
    warns = warns.filter(w => now - w.timestamp < 7 * 24 * 60 * 60 * 1000);
    userWarns.set(message.author.id, warns);

    if (warns.length === 0) {
      try {
        await message.author.send(t.yourWarnsNone);
        return message.reply('предупреждения отправлены в лс');
      } catch {
        return message.reply('не удалось отправить сообщение в лс');
      }
    }

    const list = warns.map((w, i) => `${i + 1}. ${w.reason}`).join('\n');
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

  // ✅ теперь уровень 3 тоже может повышать/понижать
  if (cmd === '!повысить' || cmd === '!promote') {
    if (!canUse(3)) return message.reply(t.noPerm);
    const mentionedUser = message.mentions.members.first() || (args[0] ? message.guild.members.cache.get(args[0]) : null);
    if (!mentionedUser) return message.reply(t.mentionUser);
    const currentLevel = getLevel(mentionedUser.id);
    if (currentLevel >= 3) return message.reply(t.maxLevel(mentionedUser.user.tag));
    const newLevel = currentLevel + 1;
    setLevel(mentionedUser.id, newLevel);
    return message.reply(t.promote(mentionedUser.user.tag, newLevel));
  }

  if (cmd === '!понизить' || cmd === '!demote') {
    if (!canUse(3)) return message.reply(t.noPerm);
    const mentionedUser = message.mentions.members.first() || (args[0] ? message.guild.members.cache.get(args[0]) : null);
    if (!mentionedUser) return message.reply(t.mentionUser);
    const currentLevel = getLevel(mentionedUser.id);
    if (currentLevel <= 0) return message.reply(t.minLevel(mentionedUser.user.tag));
    const newLevel = currentLevel - 1;
    setLevel(mentionedUser.id, newLevel);
    return message.reply(t.demote(mentionedUser.user.tag, newLevel));
  }

});

client.on('error', (err) => console.error('discord client error:', err));
process.on('unhandledRejection', (err) => console.error('unhandled error:', err));

client.login(process.env.DISCORD_TOKEN).catch(err => console.error('auth error:', err.message));
