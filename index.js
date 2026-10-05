const { 
  Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, 
  ButtonBuilder, ButtonStyle, PermissionsBitField, ChannelType, PermissionFlagsBits,
  ModalBuilder, TextInputBuilder, TextInputStyle, AttachmentBuilder
} = require('discord.js');
const express = require('express');
const mongoose = require('mongoose');
const { createCanvas } = require('canvas');

// ==========================================
// 0. GLOBAL CRASH SHIELD & TRACKERS
// ==========================================
process.on('unhandledRejection', (reason) => console.error('[Unhandled Rejection]:', reason));
process.on('uncaughtException', (err, origin) => console.error('[Uncaught Exception]:', err, origin));

const joinLog = [];
const activeVcTimers = new Map();
const snipes = new Map();
const reactionSnipes = new Map();

// ==========================================
// 1. EXPRESS KEEP-ALIVE WEB SERVER
// ==========================================
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Above Utilities Bot Online 24/7'));
app.listen(PORT, () => console.log(`Web server listening on port ${PORT}`));

// ==========================================
// 2. FULL GAME RANK & APPROVAL MAP
// ==========================================
const GAME_RANK_DATA = {
  apex: {
    name: 'Apex Legends',
    auto: ['rookie iv','rookie iii','rookie ii','rookie i','bronze iv','bronze iii','bronze ii','bronze i','silver iv','silver iii','silver ii','silver i','gold iv','gold iii','gold ii','gold i','platinum iv','platinum iii','platinum ii','platinum i','diamond iv','diamond iii','diamond ii','diamond i'],
    approval: ['master','apex predator']
  },
  battlefield: {
    name: 'Battlefield 2042',
    auto: ['bronze i','bronze ii','bronze iii','silver i','silver ii','silver iii','gold i','gold ii','gold iii','platinum i','platinum ii','platinum iii','diamond i','diamond ii','diamond iii'],
    approval: ['elite']
  },
  cod: {
    name: 'Call of Duty',
    auto: ['bronze i','bronze ii','bronze iii','silver i','silver ii','silver iii','gold i','gold ii','gold iii','platinum i','platinum ii','platinum iii','diamond i','diamond ii','diamond iii','crimson i','crimson ii','crimson iii'],
    approval: ['iridescent','top 250']
  },
  deltaforce: {
    name: 'Delta Force',
    auto: ['bronze','silver','gold','platinum','diamond'],
    approval: ['black hawk','pinnacle']
  },
  destiny2: {
    name: 'Destiny 2',
    auto: ['copper iii','copper ii','copper i','bronze iii','bronze ii','bronze i','silver iii','silver ii','silver i','gold iii','gold ii','gold i','platinum iii','platinum ii','platinum i'],
    approval: ['adept iii','adept ii','adept i','ascendant iii','ascendant ii','ascendant i']
  },
  thefinals: {
    name: 'The Finals',
    auto: ['bronze 4','bronze 3','bronze 2','bronze 1','silver 4','silver 3','silver 2','silver 1','gold 4','gold 3','gold 2','gold 1','platinum 4','platinum 3','platinum 2','platinum 1','diamond 4','diamond 3','diamond 2','diamond 1'],
    approval: ['ruby']
  },
  fortnite: {
    name: 'Fortnite',
    auto: ['bronze i','bronze ii','bronze iii','silver i','silver ii','silver iii','gold i','gold ii','gold iii','platinum i','platinum ii','platinum iii','diamond i','diamond ii','diamond iii'],
    approval: ['elite','champion','unreal']
  },
  fragpunk: {
    name: 'FragPunk',
    auto: ['bronze v','bronze iv','bronze iii','bronze ii','bronze i','silver v','silver iv','silver iii','silver ii','silver i','gold v','gold iv','gold iii','gold ii','gold i','platinum v','platinum iv','platinum iii','platinum ii','platinum i','diamond v','diamond iv','diamond iii','diamond ii','diamond i'],
    approval: ['master v','master iv','master iii','master ii','master i','punkmaster']
  },
  haloinfinite: {
    name: 'Halo Infinite',
    auto: ['bronze i','bronze ii','bronze iii','bronze iv','bronze v','bronze vi','silver i','silver ii','silver iii','silver iv','silver v','silver vi','gold i','gold ii','gold iii','gold iv','gold v','gold vi','platinum i','platinum ii','platinum iii','platinum iv','platinum v','platinum vi','diamond i','diamond ii','diamond iii','diamond iv','diamond v','diamond vi'],
    approval: ['onyx']
  },
  marvelrivals: {
    name: 'Marvel Rivals',
    auto: ['bronze iii','bronze ii','bronze i','silver iii','silver ii','silver i','gold iii','gold ii','gold i','platinum iii','platinum ii','platinum i','diamond iii','diamond ii','diamond i','grandmaster iii','grandmaster ii','grandmaster i'],
    approval: ['celestial iii','celestial ii','celestial i','eternity','one above all']
  },
  overwatch2: {
    name: 'Overwatch 2',
    auto: ['bronze 5','bronze 4','bronze 3','bronze 2','bronze 1','silver 5','silver 4','silver 3','silver 2','silver 1','gold 5','gold 4','gold 3','gold 2','gold 1','platinum 5','platinum 4','platinum 3','platinum 2','platinum 1','diamond 5','diamond 4','diamond 3','diamond 2','diamond 1','master 5','master 4','master 3','master 2','master 1'],
    approval: ['grandmaster 5','grandmaster 4','grandmaster 3','grandmaster 2','grandmaster 1','champion 5','champion 4','champion 3','champion 2','champion 1','top 500']
  },
  rocketleague: {
    name: 'Rocket League',
    auto: ['bronze i','bronze ii','bronze iii','silver i','silver ii','silver iii','gold i','gold ii','gold iii','platinum i','platinum ii','platinum iii','diamond i','diamond ii','diamond iii','champion i','champion ii','champion iii'],
    approval: ['grand champion i','grand champion ii','grand champion iii','supersonic legend']
  },
  smite: {
    name: 'Smite',
    auto: ['bronze v','bronze iv','bronze iii','bronze ii','bronze i','silver v','silver iv','silver iii','silver ii','silver i','gold v','gold iv','gold iii','gold ii','gold i','platinum v','platinum iv','platinum iii','platinum ii','platinum i','diamond v','diamond iv','diamond iii','diamond ii','diamond i'],
    approval: ['masters','grandmaster']
  },
  splitgate: {
    name: 'Splitgate',
    auto: ['bronze i','bronze ii','bronze iii','bronze iv','bronze v','silver i','silver ii','silver iii','silver iv','silver v','gold i','gold ii','gold iii','gold iv','gold v','platinum i','platinum ii','platinum iii','platinum iv','platinum v','diamond i','diamond ii','diamond iii','diamond iv','diamond v'],
    approval: ['master i','master ii','master iii','master iv','master v','pro']
  },
  rainbow6: {
    name: 'Rainbow Six Siege',
    auto: ['copper v','copper iv','copper iii','copper ii','copper i','bronze v','bronze iv','bronze iii','bronze ii','bronze i','silver v','silver iv','silver iii','silver ii','silver i','gold v','gold iv','gold iii','gold ii','gold i','platinum v','platinum iv','platinum iii','platinum ii','platinum i','emerald v','emerald iv','emerald iii','emerald ii','emerald i'],
    approval: ['diamond v','diamond iv','diamond iii','diamond ii','diamond i','champions']
  },
  forza: {
    name: 'Forza Motorsport',
    auto: ['open','qualifier','sportsman','expert','pro'],
    approval: ['pinnacle']
  },
  titanfall2: {
    name: 'Titanfall 2',
    auto: ['bronze i','bronze ii','bronze iii','bronze iv','bronze v','silver i','silver ii','silver iii','silver iv','silver v','gold i','gold ii','gold iii','gold iv','gold v','platinum i','platinum ii','platinum iii','platinum iv','platinum v'],
    approval: ['diamond i','diamond ii','diamond iii','diamond iv','diamond v']
  },
  valorant: {
    name: 'VALORANT',
    auto: ['iron 1','iron 2','iron 3','bronze 1','bronze 2','bronze 3','silver 1','silver 2','silver 3','gold 1','gold 2','gold 3','platinum 1','platinum 2','platinum 3','diamond 1','diamond 2','diamond 3'],
    approval: ['ascendant 1','ascendant 2','ascendant 3','immortal 1','immortal 2','immortal 3','radiant']
  },
  arcraiders: {
    name: 'ARC Raiders',
    auto: ['rookie i','rookie ii','rookie iii','tryhard i','tryhard ii','tryhard iii','wildcard i','wildcard ii','wildcard iii','daredevil i','daredevil ii','daredevil iii'],
    approval: ['hotshot','cantina legend']
  },
  forhonor: {
    name: 'For Honor',
    auto: ['bronze i','bronze ii','bronze iii','bronze iv','bronze v','silver i','silver ii','silver iii','silver iv','silver v','gold i','gold ii','gold iii','gold iv','gold v','platinum i','platinum ii','platinum iii','platinum iv','platinum v','diamond i','diamond ii','diamond iii','diamond iv','diamond v'],
    approval: ['master','grandmaster']
  },
  dbd: {
    name: 'Dead by Daylight',
    auto: ['ash iv','ash iii','ash ii','ash i','bronze iv','bronze iii','bronze ii','bronze i','silver iv','silver iii','silver ii','silver i','gold iv','gold iii','gold ii','gold i'],
    approval: ['iridescent iv','iridescent iii','iridescent ii','iridescent i']
  }
};

const CHAT_LEVEL_ROLES = {
  5: '1556449173568487555', 10: '1556449197652185219', 20: '1556449233014489159',
  30: '1556449264576495628', 40: '1556449292607299606', 50: '1556449321971490966',
  60: '1556449353814646916', 70: '1556449383598530721', 80: '1556449411922534422',
  90: '1556449440204849293', 100: '1556449468147048479'
};

const VC_LEVEL_ROLES = {
  5: '1556448733191995454', 10: '1556448805472309359', 20: '1556448851064258670',
  30: '1556448886904848464', 40: '1556448920928788531', 50: '1556448959264980993',
  60: '1556448988377653390', 70: '1556449033478873128', 80: '1556449065997439037',
  90: '1556449109228003338', 100: '1556449143281426492'
};

// ==========================================
// 3. MONGOOSE DATABASE SCHEMA
// ==========================================
const dbSchema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true },
  config: {
    prefixes: { type: [String], default: [',', '?', '!'] },
    quoteChannelId: { type: String, default: '1555010046994415697' },
    clipsChannelId: { type: String, default: '1471595263100584006' },
    topClipChannelId: { type: String, default: '1555385023895703794' },
    boostChannelId: { type: String, default: '1471610310686408969' },
    selfiesChannelId: { type: String, default: '1471595263545053401' },
    backupChannelId: { type: String, default: '1555358918463594646' },
    banRequestChannelId: { type: String, default: '1555028208913489990' },
    punishmentLogChannelId: { type: String, default: '1555364819433951242' },
    verificationLogChannelId: { type: String, default: '1555365045834092554' },
    transcriptsChannelId: { type: String, default: '1553623565293850645' },
    memberLogChannelId: { type: String, default: '1553625719098048542' },
    messageLogChannelId: { type: String, default: '1553625719098048542' },
    leaderboardChannelId: { type: String, default: '1554711119568834640' },
    ticketCategoryId: { type: String, default: '1554712333941473310' },
    ownerRoleId: { type: String, default: '1471595261787767002' },
    adminRoleId: { type: String, default: '1471595261787767000' },
    modRoleId: { type: String, default: '1471595261787766999' },
    trialModRoleId: { type: String, default: '1474042072288989224' },
    staffRoleId: { type: String, default: '1554712377595920474' },
    memberRoleId: { type: String, default: '1471604983706161334' },
    verifiedRoleId: { type: String, default: '1471595261787766995' },
    joinToCreateVcId: { type: String, default: '1554711771510480926' },
    mainChatId: { type: String, default: '' },
    leaderboardMsgId: { type: String, default: '' },
    topChatterRoleId: { type: String, default: '1556450402936029224' },
    topVcerRoleId: { type: String, default: '1556450363681407128' },
    topActivityRoleId: { type: String, default: '1556450437769461880' }
  },
  ticketCounter: { type: Number, default: 0 },
  userRanks: { type: Map, of: Object, default: {} },
  userCoins: { type: Map, of: Number, default: {} },
  userXp: { type: Map, of: Object, default: {} },
  dailyMessages: { type: Map, of: Number, default: {} },
  dailyVcMinutes: { type: Map, of: Number, default: {} },
  dailyActivityWins: { type: Map, of: Number, default: {} },
  warnings: { type: Map, of: Array, default: {} },
  punishments: { type: Map, of: Array, default: {} },
  staffStats: { type: Map, of: Object, default: {} },
  afkUsers: { type: Map, of: Object, default: {} },
  stickyMessages: { type: Map, of: String, default: {} }
});

const BotDB = mongoose.model('BotData_V3', dbSchema);
let dbData = null;

async function getDB(guildId = 'main') {
  if (!dbData) {
    dbData = await BotDB.findOne({ guildId });
    if (!dbData) dbData = await BotDB.create({ guildId });
  }
  return dbData;
}

async function saveDB() {
  if (dbData) await dbData.save().catch(err => console.error('Error saving MongoDB:', err));
}

if (process.env.MONGODB_URI) {
  mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('Successfully connected to MongoDB Cloud Database!'))
    .catch(err => console.error('MongoDB Connection Error:', err));
}

// ==========================================
// 4. DISCORD CLIENT CONFIGURATION
// ==========================================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildModeration
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

let globalMessageCounter = 0;
let minigameActive = false;
let currentMinigameAnswer = null;

const TRIVIA_BANK = [
  { q: "What year was Discord officially released?", a: "2015" },
  { q: "What is the highest achievable rank in Valorant?", a: "radiant" },
  { q: "What is the chemical symbol for Gold?", a: "au" },
  { q: "How many bones are in the human body?", a: "206" },
  { q: "What planet is known as the Red Planet?", a: "mars" },
  { q: "Which legend in Apex holds a perimeter security fence?", a: "wattson" },
  { q: "What is 15 multiplied by 6?", a: "90" },
  { q: "What is the square root of 144?", a: "12" },
  { q: "What gas do plants absorb from the atmosphere?", a: "carbon dioxide" },
  { q: "In Rainbow Six Siege, how many players are on a standard team?", a: "5" },
  { q: "What speed does light travel at in a vacuum approximately (km/s)?", a: "300000" },
  { q: "What year did World War II end?", a: "1945" },
  { q: "What element does 'H' represent on the periodic table?", a: "hydrogen" },
  { q: "How many sides does a heptagon have?", a: "7" },
  { q: "Which game features the rank 'Supersonic Legend'?", a: "rocket league" },
  { q: "What is 25 x 25?", a: "625" },
  { q: "What is the capital city of Japan?", a: "tokyo" },
  { q: "Who wrote 'Romeo and Juliet'?", a: "william shakespeare" },
  { q: "What is the largest organ in the human body?", a: "skin" },
  { q: "What is the hardest natural substance on Earth?", a: "diamond" },
  { q: "How many degrees are in a right angle?", a: "90" },
  { q: "Which game mode in Fortnite features no building?", a: "zero build" },
  { q: "What is 100 divided by 4?", a: "25" },
  { q: "What is the chemical formula for water?", a: "h2o" },
  { q: "What is 7 cubed (7^3)?", a: "343" },
  { q: "Which planet is largest in our solar system?", a: "jupiter" },
  { q: "What force keeps us on the ground?", a: "gravity" },
  { q: "What is the capital of France?", a: "paris" },
  { q: "How many cards are in a standard deck?", a: "52" },
  { q: "In Overwatch 2, what role is Reinhardt?", a: "tank" },
  { q: "What is 18 + 27?", a: "45" },
  { q: "What color do you get mixing blue and yellow?", a: "green" },
  { q: "What is the freeze point of water in Celsius?", a: "0" },
  { q: "How many continents are there on Earth?", a: "7" },
  { q: "In Halo, what is the Master Chief's service number?", a: "117" },
  { q: "What primary gas makes up Earth's atmosphere?", a: "nitrogen" },
  { q: "What is 12 x 11?", a: "132" },
  { q: "Which organ pumps blood through the body?", a: "heart" },
  { q: "What year was Apex Legends released?", a: "2019" },
  { q: "What is 50% of 250?", a: "125" }
];

function checkModHierarchy(member, db) {
  if (member.id === member.guild.ownerId || member.roles.cache.has(db.config.ownerRoleId)) return 'owner';
  if (member.roles.cache.has(db.config.adminRoleId)) return 'admin';
  if (member.roles.cache.has(db.config.modRoleId)) return 'mod';
  if (member.roles.cache.has(db.config.trialModRoleId)) return 'trial';
  return false;
}

async function recordStaffStat(staffId, type) {
  const db = await getDB();
  const stats = db.staffStats.get(staffId) || { warns: 0, timeouts: 0, banRequests: 0, bans: 0, dates: [] };
  stats[type] = (stats[type] || 0) + 1;
  stats.dates.push({ type, timestamp: Date.now() });
  db.staffStats.set(staffId, stats);
  await saveDB();
}

async function logToChannel(guild, channelId, title, desc, color = '#ED4245') {
  if (!channelId) return;
  const chan = guild.channels.cache.get(channelId);
  if (!chan) return;
  const embed = new EmbedBuilder().setColor(color).setTitle(title).setDescription(desc).setTimestamp();
  chan.send({ embeds: [embed] }).catch(() => {});
}

async function addXp(member, amount, type = 'chat') {
  const db = await getDB();
  const userId = member.id;
  const data = db.userXp.get(userId) || { chatXp: 0, chatLvl: 0, vcXp: 0, vcLvl: 0 };

  let mult = 1.0;
  if (member.premiumSince) mult *= 2.0;

  const topChatters = Array.from(db.dailyMessages.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5).map(e => e[0]);
  if (topChatters.includes(userId)) mult *= 1.5;

  const finalAmount = Math.floor(amount * mult);

  if (type === 'chat') {
    data.chatXp += finalAmount;
    const nextLvlXp = Math.floor(100 * Math.pow(data.chatLvl + 1, 1.5));
    if (data.chatXp >= nextLvlXp) {
      data.chatLvl += 1;
      if (CHAT_LEVEL_ROLES[data.chatLvl]) {
        for (const rId of Object.values(CHAT_LEVEL_ROLES)) {
          if (member.roles.cache.has(rId)) await member.roles.remove(rId).catch(() => {});
        }
        await member.roles.add(CHAT_LEVEL_ROLES[data.chatLvl]).catch(() => {});
      }
    }
  } else {
    data.vcXp += finalAmount;
    const nextLvlXp = Math.floor(100 * Math.pow(data.vcLvl + 1, 1.5));
    if (data.vcXp >= nextLvlXp) {
      data.vcLvl += 1;
      if (VC_LEVEL_ROLES[data.vcLvl]) {
        for (const rId of Object.values(VC_LEVEL_ROLES)) {
          if (member.roles.cache.has(rId)) await member.roles.remove(rId).catch(() => {});
        }
        await member.roles.add(VC_LEVEL_ROLES[data.vcLvl]).catch(() => {});
      }
    }
  }

  db.userXp.set(userId, data);
  await saveDB();
}

function setupLeaderboardLoop() {
  setInterval(async () => {
    const db = await getDB();
    const now = new Date();
    const cdtHours = (now.getUTCHours() - 5 + 24) % 24;
    const cdtMinutes = now.getUTCMinutes();

    for (const guild of client.guilds.cache.values()) {
      const lbChan = guild.channels.cache.get(db.config.leaderboardChannelId);
      if (!lbChan) continue;

      if (cdtHours === 0 && cdtMinutes < 5) {
        const topChatter = Array.from(db.dailyMessages.entries()).sort((a,b)=>b[1]-a[1])[0];
        const topVcer = Array.from(db.dailyVcMinutes.entries()).sort((a,b)=>b[1]-a[1])[0];
        const topAct = Array.from(db.dailyActivityWins.entries()).sort((a,b)=>b[1]-a[1])[0];

        if (topChatter) {
          db.userCoins.set(topChatter[0], (db.userCoins.get(topChatter[0]) || 0) + 100);
          const m = await guild.members.fetch(topChatter[0]).catch(()=>null);
          if (m && db.config.topChatterRoleId) m.roles.add(db.config.topChatterRoleId).catch(() => {});
        }
        if (topVcer) {
          db.userCoins.set(topVcer[0], (db.userCoins.get(topVcer[0]) || 0) + 100);
          const m = await guild.members.fetch(topVcer[0]).catch(()=>null);
          if (m && db.config.topVcerRoleId) m.roles.add(db.config.topVcerRoleId).catch(() => {});
        }
        if (topAct) {
          db.userCoins.set(topAct[0], (db.userCoins.get(topAct[0]) || 0) + 100);
          const m = await guild.members.fetch(topAct[0]).catch(()=>null);
          if (m && db.config.topActivityRoleId) m.roles.add(db.config.topActivityRoleId).catch(() => {});
        }

        db.dailyMessages.clear();
        db.dailyVcMinutes.clear();
        db.dailyActivityWins.clear();
        await saveDB();
      }

      const topMsgs = Array.from(db.dailyMessages.entries()).sort((a,b)=>b[1]-a[1]).slice(0,10);
      const topVc = Array.from(db.dailyVcMinutes.entries()).sort((a,b)=>b[1]-a[1]).slice(0,10);

      let msgDesc = topMsgs.map((e, idx) => `**${idx+1}.** <@${e[0]}> — \`${e[1]} msgs\``).join('\n') || 'No activity today.';
      let vcDesc = topVc.map((e, idx) => `**${idx+1}.** <@${e[0]}> — \`${Math.floor(e[1])} mins\``).join('\n') || 'No VC activity today.';

      const lbEmbed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle('📊 Daily Live Leaderboard (Resets Midnight CDT)')
        .addFields(
          { name: '💬 Top Chatters', value: msgDesc, inline: true },
          { name: '🎙 Top VC Members (Unmuted)', value: vcDesc, inline: true }
        )
        .setTimestamp();

      if (db.config.leaderboardMsgId) {
        const msg = await lbChan.messages.fetch(db.config.leaderboardMsgId).catch(()=>null);
        if (msg) await msg.edit({ embeds: [lbEmbed] });
        else {
          const newMsg = await lbChan.send({ embeds: [lbEmbed] });
          db.config.leaderboardMsgId = newMsg.id;
          await saveDB();
        }
      } else {
        const newMsg = await lbChan.send({ embeds: [lbEmbed] });
        db.config.leaderboardMsgId = newMsg.id;
        await saveDB();
      }
    }
  }, 5 * 60 * 1000);
}

async function sendTranscript(channel, label) {
  const db = await getDB();
  const logChan = channel.guild.channels.cache.get(db.config.transcriptsChannelId);
  if (!logChan) return;

  const messages = await channel.messages.fetch({ limit: 100 }).catch(() => null);
  if (!messages || messages.size === 0) return;

  const sorted = Array.from(messages.values()).reverse();
  let transcriptText = `===========================================\nTRANSCRIPT TYPE: ${label.toUpperCase()}\nCHANNEL: #${channel.name}\nDATE:${new Date().toISOString()}\n===========================================\n\n`;

  sorted.forEach(m => {
    transcriptText += `[${m.createdAt.toLocaleString()}] ${m.author.tag}:${m.content}\n`;
  });

  const buffer = Buffer.from(transcriptText, 'utf-8');
  const attachment = new AttachmentBuilder(buffer, { name: `${label.toLowerCase()}-${channel.name}-transcript.txt` });
  await logChan.send({ content: `📜 **${label} Transcript Logged:** \`${channel.name}\``, files: [attachment] }).catch(() => {});
}

client.once('ready', async () => {
  console.log(`[SYSTEM READY] Logged in as ${client.user.tag}`);
  await getDB();
  setupLeaderboardLoop();
});

// ==========================================
// 5. MEMBER, AUTOMOD & LOGGING EVENTS
// ==========================================
client.on('guildMemberAdd', async (member) => {
  const db = await getDB();

  if (db.config.autoRoleId) {
    const role = member.guild.roles.cache.get(db.config.autoRoleId);
    if (role) member.roles.add(role).catch(() => {});
  }

  logToChannel(
    member.guild, 
    db.config.memberLogChannelId, 
    '📥 Member Joined', 
    `**User:** <@${member.id}> (${member.user.tag})\n**ID:** \`${member.id}\`\n**Account Created:** <t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`,
    '#57F287'
  );
});

client.on('guildMemberRemove', async (member) => {
  const db = await getDB();
  logToChannel(member.guild, db.config.memberLogChannelId, '📤 Member Left', `**User:** <@${member.id}> (${member.user.tag})\n**ID:** \`${member.id}\``, '#ED4245');
});

client.on('guildMemberUpdate', async (oldMember, newMember) => {
  const db = await getDB();
  
  const added = newMember.roles.cache.filter(r => !oldMember.roles.cache.has(r.id));
  const removed = oldMember.roles.cache.filter(r => !newMember.roles.cache.has(r.id));

  if (added.size > 0 || removed.size > 0) {
    let desc = `**User:** <@${newMember.id}>\n`;
    if (added.size > 0) desc += `**Added Roles:** ${added.map(r => `<@&${r.id}>`).join(', ')}\n`;
    if (removed.size > 0) desc += `**Removed Roles:** ${removed.map(r => `<@&${r.id}>`).join(', ')}\n`;
    logToChannel(newMember.guild, db.config.memberLogChannelId, '🛡️ Role Update', desc, '#5865F2');
  }

  if (!oldMember.premiumSince && newMember.premiumSince) {
    const boostChan = newMember.guild.channels.cache.get(db.config.boostChannelId);
    if (boostChan) {
      boostChan.send({
        embeds: [
          new EmbedBuilder()
            .setColor('#F47FFF')
            .setTitle('🚀 Thank You For Boosting!')
            .setDescription(`Thank you <@${newMember.id}> for boosting the server!\n\n✨ **Booster Perks:**\n• Claim custom Battle Royale roles using \`,setrank <game> <rank>\`!\n• 2x XP Boost across all chat and VC levels!\n• Access to \`,s\` (snipe) command.`)
        ]
      }).catch(() => {});
    }
  }
});

client.on('messageDelete', async (message) => {
  if (message.author?.bot || !message.guild) return;
  const db = await getDB();

  snipes.set(message.channel.id, {
    content: message.content || '*[Attachment/Embed]*',
    author: message.author,
    time: message.createdAt,
    image: message.attachments.first()?.proxyURL || null
  });

  const fetchedLogs = await message.guild.fetchAuditLogs({ limit: 1, type: 72 }).catch(() => null);
  const auditEntry = fetchedLogs?.entries.first();
  const executor = (auditEntry && auditEntry.target.id === message.author.id) ? auditEntry.executor.tag : 'Self / Unknown';

  logToChannel(
    message.guild,
    db.config.messageLogChannelId,
    '💬 Message Deleted',
    `**Author:** <@${message.author.id}> (${message.author.tag})\n**Deleted By:** ${executor}\n**Channel:** <#${message.channel.id}>\n**Content:** ${message.content || '*[Media]*'}`
  );
});

client.on('messageReactionRemove', async (reaction, user) => {
  if (user.bot) return;
  reactionSnipes.set(reaction.message.channel.id, {
    emoji: reaction.emoji.name,
    user: user,
    messageUrl: reaction.message.url
  });
});

client.on('messageUpdate', async (oldMsg, newMsg) => {
  if (oldMsg.author?.bot || oldMsg.content === newMsg.content) return;
  const db = await getDB();
  logToChannel(
    oldMsg.guild,
    db.config.messageLogChannelId,
    '✏️ Message Edited',
    `**Author:** <@${oldMsg.author.id}>\n**Channel:** <#${oldMsg.channel.id}>\n**Before:** ${oldMsg.content}\n**After:** ${newMsg.content}`,
    '#FEE75C'
  );
});

// ==========================================
// 6. VOICE CHANNELS & VC LEADERBOARD
// ==========================================
client.on('voiceStateUpdate', async (oldState, newState) => {
  const db = await getDB();
  const guild = newState.guild;
  const member = newState.member;

  if (!oldState.channelId && newState.channelId) {
    logToChannel(guild, db.config.messageLogChannelId, '🎙 VC Joined', `<@${member.id}> joined <#${newState.channelId}>`, '#57F287');
  } else if (oldState.channelId && !newState.channelId) {
    logToChannel(guild, db.config.messageLogChannelId, '🎙 VC Left', `<@${member.id}> left <#${oldState.channelId}>`, '#ED4245');
  }

  if (newState.channelId && newState.channelId === db.config.joinToCreateVcId) {
    const createdChannel = await guild.channels.create({
      name: `🔊 ${member.user.username}'s Room`,
      type: ChannelType.GuildVoice,
      parent: newState.channel.parentId,
      permissionOverwrites: [
        { id: member.id, allow: [PermissionFlagsBits.ManageChannels, PermissionFlagsBits.MoveMembers, PermissionFlagsBits.Connect] }
      ]
    }).catch(() => null);

    if (createdChannel) {
      await newState.setChannel(createdChannel).catch(() => {});
      const menuEmbed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle('🎙 Custom Voice Room')
        .setDescription('Manage your voice room using the buttons below or commands:\n• `,vc permit @user`\n• `,vc remove @user`');

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('vc_lock').setLabel('🔒 Lock').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('vc_unlock').setLabel('🔓 Unlock').setStyle(ButtonStyle.Success)
      );
      await createdChannel.send({ embeds: [menuEmbed], components: [row] }).catch(() => {});
    }
  }

  if (oldState.channel && oldState.channel.name.startsWith('🔊 ') && oldState.channel.members.size === 0) {
    await sendTranscript(oldState.channel, 'VC');
    await oldState.channel.delete().catch(() => {});
  }

  const isMuted = newState.mute || newState.deaf || newState.selfMute || newState.selfDeaf;
  if (newState.channelId && !isMuted) {
    if (!activeVcTimers.has(member.id)) activeVcTimers.set(member.id, Date.now());
  } else {
    if (activeVcTimers.has(member.id)) {
      const joinTime = activeVcTimers.get(member.id);
      activeVcTimers.delete(member.id);
      const minutes = (Date.now() - joinTime) / 60000;

      if (minutes > 0.5) {
        db.dailyVcMinutes.set(member.id, (db.dailyVcMinutes.get(member.id) || 0) + minutes);
        await addXp(member, Math.floor(minutes * 10), 'vc');
        await saveDB();
      }
    }
  }
});

// ==========================================
// 7. MAIN MESSAGES, AUTOMOD & COMMAND HANDLER
// ==========================================
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;
  const db = await getDB();

  const slurRegex = /\b(fag|faggot|nigger|nigga)\b/i;
  if (slurRegex.test(message.content)) {
    await message.delete().catch(() => {});
    logToChannel(message.guild, db.config.messageLogChannelId, '🚨 AutoMod Triggered', `**User:** <@${message.author.id}>\n**Content:** ${message.content}\n**Action:** Auto-Deleted`, '#ED4245');
    return message.channel.send(`⚠️ <@${message.author.id}> slur detected and removed.`).then(m => setTimeout(() => m.delete().catch(() => {}), 5000));
  }

  if (db.config.selfiesChannelId && message.channel.id === db.config.selfiesChannelId) {
    const hasImage = message.attachments.size > 0 || message.embeds.length > 0;
    if (!hasImage) {
      await message.delete().catch(() => {});
      return;
    } else {
      await message.react('👑').catch(() => {});
    }
  }

  if (db.config.clipsChannelId && message.channel.id === db.config.clipsChannelId) {
    const hasMedia = message.attachments.size > 0 || message.content.includes('http');
    if (!hasMedia) {
      await message.delete().catch(() => {});
      return;
    } else {
      await message.react('⬆️').catch(() => {});
      await message.react('⬇️').catch(() => {});
    }
  }

  if (db.stickyMessages.get(message.channel.id)) {
    const text = db.stickyMessages.get(message.channel.id);
    const msgs = await message.channel.messages.fetch({ limit: 5 }).catch(() => null);
    if (msgs) {
      const lastSticky = msgs.find(m => m.author.id === client.user.id && m.content === text);
      if (lastSticky) await lastSticky.delete().catch(() => {});
    }
    await message.channel.send(text).catch(() => {});
  }

  if (db.afkUsers.has(message.author.id)) {
    const afkData = db.afkUsers.get(message.author.id);
    const mins = Math.floor((Date.now() - afkData.timestamp) / 60000);
    db.afkUsers.delete(message.author.id);
    await saveDB();
    message.reply(`Welcome back! You were AFK for **${mins} mins**.`).then(m => setTimeout(() => m.delete().catch(() => {}), 10000)).catch(() => {});
  }

  db.dailyMessages.set(message.author.id, (db.dailyMessages.get(message.author.id) || 0) + 1);
  await addXp(message.member, 15, 'chat');

  globalMessageCounter++;
  if (globalMessageCounter % 100 === 0) {
    db.userCoins.set(message.author.id, (db.userCoins.get(message.author.id) || 0) + 10);
    message.channel.send(`🎉 **100 Messages Hit!** <@${message.author.id}> earned **10 dabloons**!`).catch(() => {});
  }

  const isMainChat = db.config.mainChatId ? message.channel.id === db.config.mainChatId : true;
  if (isMainChat && globalMessageCounter % 40 === 0 && !minigameActive) {
    minigameActive = true;
    const selected = TRIVIA_BANK[Math.floor(Math.random() * TRIVIA_BANK.length)];
    currentMinigameAnswer = selected.a.toLowerCase();

    const tMsg = await message.channel.send(`⚡ **TRIVIA TIME:** ${selected.q}\n*Type answer first to win **15 dabloons**! (45s limit)*`).catch(() => {});

    setTimeout(async () => {
      if (minigameActive) {
        minigameActive = false;
        currentMinigameAnswer = null;
        if (tMsg) await tMsg.delete().catch(() => {});
        message.channel.send('❌ Nobody got the trivia answer in time! Better luck next time.').catch(() => {});
      }
    }, 45000);
  }

  if (minigameActive && isMainChat && message.content.trim().toLowerCase() === currentMinigameAnswer) {
    minigameActive = false;
    currentMinigameAnswer = null;
    db.userCoins.set(message.author.id, (db.userCoins.get(message.author.id) || 0) + 15);
    db.dailyActivityWins.set(message.author.id, (db.dailyActivityWins.get(message.author.id) || 0) + 1);
    await addXp(message.member, 50, 'chat');
    await saveDB();
    message.reply('🎉 Correct! You won **15 dabloons** and **50 Bonus XP**!').catch(() => {});
  }

  const usedPrefix = db.config.prefixes.find(p => message.content.startsWith(p));
  if (!usedPrefix) return;

  const args = message.content.slice(usedPrefix.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();
  const modRole = checkModHierarchy(message.member, db);

  message.delete().catch(() => {});

  if (command === 'warn') {
    if (!modRole) return;
    const target = message.mentions.members.first();
    const reason = args.slice(1).join(' ') || 'No reason provided';
    if (!target) return message.channel.send('Usage: `,warn @user <reason>`');

    const userWarns = db.warnings.get(target.id) || [];
    userWarns.push({ reason, moderator: message.author.tag, date: new Date().toLocaleDateString() });
    db.warnings.set(target.id, userWarns);

    const logs = db.punishments.get(target.id) || [];
    logs.push({ type: 'WARN', reason, mod: message.author.tag, date: new Date().toISOString() });
    db.punishments.set(target.id, logs);

    await recordStaffStat(message.author.id, 'warns');
    await saveDB();

    logToChannel(message.guild, db.config.punishmentLogChannelId, '⚠️ Warning Issued', `**User:** <@${target.id}> (\`${target.id}\`)\n**Moderator:** <@${message.author.id}> (\`${message.author.id}\`)\n**Reason:** ${reason}`);
    return message.channel.send({ embeds: [new EmbedBuilder().setColor('#FEE75C').setTitle('⚠️ Member Warned').setDescription(`**User:** <@${target.id}> (\`${target.id}\`)\n**Moderator:** <@${message.author.id}> (\`${message.author.id}\`)\n**Reason:** ${reason}`)] });
  }

  if (command === 'timeout') {
    if (!modRole) return;
    const target = message.mentions.members.first();
    const mins = parseInt(args[1]);
    const reason = args.slice(2).join(' ') || 'No reason provided';
    if (!target || isNaN(mins)) return message.channel.send('Usage: `,timeout @user <mins> <reason>`');

    await target.timeout(mins * 60 * 1000, reason).catch(() => {});
    await recordStaffStat(message.author.id, 'timeouts');

    logToChannel(message.guild, db.config.punishmentLogChannelId, '⏳ Member Timed Out', `**User:** <@${target.id}> (\`${target.id}\`)\n**Moderator:** <@${message.author.id}> (\`${message.author.id}\`)\n**Duration:** ${mins}m\n**Reason:** ${reason}`);
    return message.channel.send({ embeds: [new EmbedBuilder().setColor('#ED4245').setTitle('⏳ Timeout Applied').setDescription(`**User:** <@${target.id}> (\`${target.id}\`)\n**Moderator:** <@${message.author.id}> (\`${message.author.id}\`)\n**Duration:** ${mins} mins\n**Reason:** ${reason}`)] });
  }

  if (command === 'banrequests' || command === 'banrequest') {
    if (!modRole) return;
    const target = message.mentions.users.first();
    const reason = args.slice(1).join(' ');
    if (!target || !reason) return message.channel.send('Usage: `,banrequest @user <reason>`');

    await recordStaffStat(message.author.id, 'banRequests');
    const banChan = message.guild.channels.cache.get(db.config.banRequestChannelId);
    if (banChan) {
      const embed = new EmbedBuilder()
        .setColor('#ED4245')
        .setTitle('🚨 Ban Request Submitted')
        .setDescription(`**Target:** <@${target.id}> (\`${target.id}\`)\n**Requested By:** <@${message.author.id}> (\`${message.author.id}\`)\n**Reason:** ${reason}`);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`ban_approve_${target.id}`).setLabel('Approve Ban').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`ban_deny_${target.id}`).setLabel('Deny Request').setStyle(ButtonStyle.Secondary)
      );
      banChan.send({ embeds: [embed], components: [row] });
    }
    return message.channel.send(`✅ Ban request submitted for <@${target.id}>.`);
  }

  if (command === 'ban') {
    if (modRole !== 'admin' && modRole !== 'owner') return;
    const target = message.mentions.members.first();
    const reason = args.slice(1).join(' ') || 'No reason provided';
    if (!target) return message.channel.send('Usage: `,ban @user <reason>`');

    await target.ban({ reason }).catch(() => {});
    await recordStaffStat(message.author.id, 'bans');

    logToChannel(message.guild, db.config.punishmentLogChannelId, '🔨 Member Banned', `**User:** <@${target.id}> (\`${target.id}\`)\n**Moderator:** <@${message.author.id}> (\`${message.author.id}\`)\n**Reason:** ${reason}`);
    return message.channel.send({ embeds: [new EmbedBuilder().setColor('#ED4245').setTitle('🔨 Member Banned').setDescription(`**User:** <@${target.id}> (\`${target.id}\`)\n**Moderator:** <@${message.author.id}> (\`${message.author.id}\`)\n**Reason:** ${reason}`)] });
  }

  if (command === 'add-role' || command === 'remove-role') {
    if (modRole !== 'mod' && modRole !== 'admin' && modRole !== 'owner') return;
    const target = message.mentions.members.first();
    const role = message.mentions.roles.first();
    if (!target || !role) return message.channel.send(`Usage: \`,${command} @user @role\``);

    if (command === 'add-role') await target.roles.add(role).catch(() => {});
    else await target.roles.remove(role).catch(() => {});
    return message.channel.send(`✅ Role ${command === 'add-role' ? 'added to' : 'removed from'} <@${target.id}>.`);
  }

  if (command === 'remove-warn') {
    if (!modRole) return;
    const target = message.mentions.users.first();
    if (!target) return message.channel.send('Usage: `,remove-warn @user`');

    const warns = db.warnings.get(target.id) || [];
    if (warns.length > 0) {
      warns.pop();
      db.warnings.set(target.id, warns);
      await saveDB();
      return message.channel.send(`✅ Removed most recent warning for <@${target.id}>.`);
    }
  }

  if (command === 'clear-punishments') {
    if (modRole !== 'admin' && modRole !== 'owner') return;
    const target = message.mentions.users.first();
    if (!target) return message.channel.send('Usage: `,clear-punishments @user`');

    db.warnings.delete(target.id);
    db.punishments.delete(target.id);
    await saveDB();
    return message.channel.send(`✅ Cleared all punishment history for <@${target.id}>.`);
  }

  if (command === 'staffstats') {
    if (!modRole) return;
    const target = message.mentions.users.first() || message.author;
    const stats = db.staffStats.get(target.id) || { warns: 0, timeouts: 0, banRequests: 0, bans: 0, dates: [] };

    const now = Date.now();
    const p24h = stats.dates.filter(d => now - d.timestamp < 86400000).length;
    const p7d = stats.dates.filter(d => now - d.timestamp < 604800000).length;
    const p30d = stats.dates.filter(d => now - d.timestamp < 2592000000).length;

    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle(`🛡 Staff Performance — ${target.username}`)
      .addFields(
        { name: 'Lifetime Actions', value: `• **Warns:** ${stats.warns}\n• **Timeouts:** ${stats.timeouts}\n• **Ban Requests:** ${stats.banRequests}\n• **Bans:** ${stats.bans}`, inline: true },
        { name: 'Activity Timelines', value: `• **Past 24 Hours:** ${p24h}\n• **Past 7 Days:** ${p7d}\n• **Past 30 Days:** ${p30d}`, inline: true }
      );
    return message.channel.send({ embeds: [embed] });
  }

  if (command === 'help') {
    const helpEmbed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle('📚 Above Utilities — Command Directory')
      .addFields(
        { name: '🛠 Moderation', value: '`,warn`, `,timeout`, `,banrequest`, `,ban`, `,add-role`, `,remove-role`, `,remove-warn`, `,clear-punishments`, `,staffstats`' },
        { name: '🎮 Ranks & Games', value: '`,setrank <game> <rank>`, `,rank [@user]`' },
        { name: '🪙 Economy & Stats', value: '`,bal`, `,stats`, `,afk`' },
        { name: '📌 Panels & Utility', value: '`,ticket`, `,selfie`, `,sm <text>`, `,quote`, `,backup`' },
        { name: '🕵️ Snipes', value: '`,s` (Boosters/Staff), `,rs` (Staff), `,cs` (Staff)' }
      );
    return message.channel.send({ embeds: [helpEmbed] });
  }

  if (command === 'ping') {
    return message.channel.send(`🏓 **Pong!** Latency: \`${Math.round(client.ws.ping)}ms\``);
  }

  if (command === 'backup') {
    if (modRole !== 'owner') return;
    const backupJson = JSON.stringify(db.toObject(), null, 2);
    const buffer = Buffer.from(backupJson, 'utf-8');
    const attachment = new AttachmentBuilder(buffer, { name: `db-backup-${Date.now()}.json` });
    return message.channel.send({ content: '📦 **Manual Owner Database Backup Export:**', files: [attachment] });
  }

  if (command === 'sm' || command === 'sendmessage') {
    if (modRole !== 'admin' && modRole !== 'owner') return;
    const text = args.join(' ');
    if (text) message.channel.send(text);
    return;
  }

  if (command === 'sticky') {
    if (modRole !== 'owner') return;
    const text = args.join(' ');
    if (!text) return message.channel.send('Usage: `,sticky <text>`');
    db.stickyMessages.set(message.channel.id, text);
    await saveDB();
    return message.channel.send(text);
  }

  if (command === 'unsticky') {
    if (modRole !== 'owner') return;
    db.stickyMessages.delete(message.channel.id);
    await saveDB();
    return message.channel.send('✅ Sticky message removed.');
  }

  if (command === 'quote') {
    const targetMsg = message.reference ? await message.channel.messages.fetch(message.reference.messageId).catch(() => null) : null;
    if (!targetMsg) return message.channel.send('Reply to a message with `,quote` to quote it!');

    const canvas = createCanvas(800, 300);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#0f0f11';
    ctx.fillRect(0, 0, 800, 300);

    ctx.fillStyle = '#ffffff';
    ctx.font = '28px sans-serif';
    ctx.fillText(`"${targetMsg.content}"`, 50, 140, 700);

    ctx.fillStyle = '#8e9297';
    ctx.font = '22px sans-serif';
    ctx.fillText(`— ${targetMsg.author.tag}`, 50, 210);

    const attachment = new AttachmentBuilder(canvas.toBuffer(), { name: 'quote.png' });
    const qChan = message.guild.channels.cache.get(db.config.quoteChannelId);
    if (qChan) qChan.send({ content: `Quoted by <@${message.author.id}>:`, files: [attachment] });
    return message.channel.send({ files: [attachment] });
  }

  if (command === 's' || command === 'snipe') {
    const isBooster = message.member.premiumSince;
    if (!isBooster && !modRole) return message.channel.send('❌ Snipe is reserved for Server Boosters and Staff.');
    const sniped = snipes.get(message.channel.id);
    if (!sniped) return message.channel.send('Nothing to snipe!');

    const embed = new EmbedBuilder()
      .setColor('#ED4245')
      .setAuthor({ name: sniped.author.tag, iconURL: sniped.author.displayAvatarURL() })
      .setDescription(sniped.content)
      .setTimestamp(sniped.time);
    if (sniped.image) embed.setImage(sniped.image);
    return message.channel.send({ embeds: [embed] });
  }

  if (command === 'rs') {
    if (!modRole) return;
    const rSniped = reactionSnipes.get(message.channel.id);
    if (!rSniped) return message.channel.send('No reactions to snipe!');
    return message.channel.send(`🕵️ **Reaction Snipe:** <@${rSniped.user.id}> removed reaction \`${rSniped.emoji}\` from [Jump to Message](${rSniped.messageUrl})`);
  }

  if (command === 'cs') {
    if (!modRole) return;
    snipes.delete(message.channel.id);
    reactionSnipes.delete(message.channel.id);
    return message.channel.send('✅ Channel snipes cleared.');
  }

  if (command === 'setrank' || command === 'rankset') {
    const gameKey = args[0]?.toLowerCase();
    const rankName = args.slice(1).join(' ').toLowerCase();

    if (!gameKey || !rankName || !GAME_RANK_DATA[gameKey]) {
      return message.channel.send(`Usage: \`,setrank <game> <rank>\`\nValid games: \`${Object.keys(GAME_RANK_DATA).join(', ')}\``);
    }

    const gData = GAME_RANK_DATA[gameKey];
    const isApproval = gData.approval.includes(rankName);
    const isAuto = gData.auto.includes(rankName);

    if (!isApproval && !isAuto) return message.channel.send(`❌ Invalid rank for **${gData.name}**.`);

    const profile = db.userRanks.get(message.author.id) || {};
    profile[gameKey] = { rank: rankName, verified: !isApproval };
    db.userRanks.set(message.author.id, profile);
    await saveDB();

    if (isApproval) {
      const vChan = message.guild.channels.cache.get(db.config.verificationLogChannelId);
      if (vChan) {
        const embed = new EmbedBuilder()
          .setColor('#FEE75C')
          .setTitle('🎮 Rank Verification Claim')
          .setDescription(`**User:** <@${message.author.id}>\n**Game:** ${gData.name}\n**Claimed Rank:** ${rankName.toUpperCase()}`);

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`vr_approve_${message.author.id}_${gameKey}`).setLabel('Approve Rank').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`vr_deny_${message.author.id}_${gameKey}`).setLabel('Deny Rank').setStyle(ButtonStyle.Danger)
        );
        vChan.send({ embeds: [embed], components: [row] });
      }
      return message.channel.send(`⚠️ **${rankName.toUpperCase()}** requires verification! Open a ticket with screenshot proof.`);
    } else {
      return message.channel.send(`✅ Your **${gData.name}** rank was set to **${rankName.toUpperCase()}**!`);
    }
  }

  if (command === 'rank') {
    const target = message.mentions.users.first() || message.author;
    const profile = db.userRanks.get(target.id);
    if (!profile || Object.keys(profile).length === 0) return message.channel.send(`No ranks registered for **${target.username}**.`);

    const embed = new EmbedBuilder().setColor('#5865F2').setTitle(`🎮 Ranks — ${target.username}`);
    for (const [gKey, data] of Object.entries(profile)) {
      const badge = data.verified ? '✅' : '❌ *(Pending)*';
      embed.addFields({ name: GAME_RANK_DATA[gKey]?.name || gKey.toUpperCase(), value: `\`${data.rank.toUpperCase()}\` ${badge}`, inline: true });
    }
    return message.channel.send({ embeds: [embed] });
  }

  if (command === 'stats') {
    const target = message.mentions.users.first() || message.author;
    const xpData = db.userXp.get(target.id) || { chatXp: 0, chatLvl: 0, vcXp: 0, vcLvl: 0 };
    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle(`📈 Activity & Stats — ${target.username}`)
      .addFields(
        { name: '💬 Chat Leveling', value: `• **Level:** ${xpData.chatLvl}\n• **Total XP:** ${xpData.chatXp}`, inline: true },
        { name: '🎙 VC Leveling', value: `• **Level:** ${xpData.vcLvl}\n• **Total XP:** ${xpData.vcXp}`, inline: true }
      );
    return message.channel.send({ embeds: [embed] });
  }

  if (command === 'bal') {
    const target = message.mentions.users.first() || message.author;
    const coins = db.userCoins.get(target.id) || 0;
    return message.channel.send(`🪙 **${target.username}** has **${coins} dabloons**.`);
  }

  if (command === 'afk') {
    const reason = args.join(' ') || 'AFK';
    db.afkUsers.set(message.author.id, { reason, timestamp: Date.now() });
    await saveDB();
    return message.channel.send(`Set AFK: **${reason}**`);
  }

  if (command === 'selfie') {
    if (modRole !== 'admin' && modRole !== 'owner') return;
    const selfieEmbed = new EmbedBuilder()
      .setColor('#EB459E')
      .setTitle('🤳 Identity Verification Instructions')
      .setDescription(
        'To verify for selfies, post a photo in this channel with:\n' +
        '1. Your **face fully in the picture**.\n' +
        '2. A paper with **your username**, **today\'s date**, and `/above` written on it.'
      );
    return message.channel.send({ embeds: [selfieEmbed] });
  }

  if (command === 'ticket') {
    if (modRole !== 'admin' && modRole !== 'owner') return;
    const embed = new EmbedBuilder().setColor('#57F287').setTitle('🎟 Support Ticket Center').setDescription('Click below to open a ticket.');
    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('open_ticket_modal').setLabel('Create Ticket').setStyle(ButtonStyle.Primary).setEmoji('📩'));
    return message.channel.send({ embeds: [embed], components: [row] });
  }
});

// ==========================================
// 8. INTERACTION HANDLER (BUTTONS & MODALS)
// ==========================================
client.on('interactionCreate', async (interaction) => {
  const db = await getDB();

  if (interaction.isButton()) {
    if (interaction.customId === 'open_ticket_modal') {
      const modal = new ModalBuilder().setCustomId('modal_create_ticket').setTitle('Open Support Ticket');
      const input = new TextInputBuilder().setCustomId('ticket_reason').setLabel('Reason for opening ticket').setStyle(TextInputStyle.Paragraph).setRequired(false);
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return interaction.showModal(modal);
    }

    if (interaction.customId.startsWith('ban_approve_')) {
      const targetId = interaction.customId.split('_')[2];
      await interaction.guild.members.ban(targetId, { reason: 'Approved Ban Request' }).catch(() => {});
      return interaction.reply(`✅ Approved ban for <@${targetId}>.`);
    }

    if (interaction.customId.startsWith('ban_deny_')) {
      const targetId = interaction.customId.split('_')[2];
      return interaction.reply(`❌ Denied ban for <@${targetId}>.`);
    }

    if (interaction.customId.startsWith('vr_approve_')) {
      const [, , uId, gKey] = interaction.customId.split('_');
      const profile = db.userRanks.get(uId);
      if (profile && profile[gKey]) {
        profile[gKey].verified = true;
        db.userRanks.set(uId, profile);
        await saveDB();
        return interaction.reply(`✅ Approved rank for <@${uId}>.`);
      }
    }

    if (interaction.customId === 'ticket_close') {
      await interaction.reply('🔒 Generating transcript and closing ticket...');
      await sendTranscript(interaction.channel, 'Ticket');
      setTimeout(() => interaction.channel.delete().catch(() => {}), 4000);
    }
  }

  if (interaction.isModalSubmit()) {
    if (interaction.customId === 'modal_create_ticket') {
      const reason = interaction.fields.getTextInputValue('ticket_reason') || 'No reason provided';
      db.ticketCounter += 1;
      await saveDB();

      const numStr = String(db.ticketCounter).padStart(4, '0');
      const chan = await interaction.guild.channels.create({
        name: `ticket-${interaction.user.username}-${numStr}`,
        type: ChannelType.GuildText,
        parent: db.config.ticketCategoryId || null,
        permissionOverwrites: [
          { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
          { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
          { id: db.config.staffRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
        ]
      });

      if (chan) {
        chan.send(`<@&${db.config.staffRoleId}> Ticket created by <@${interaction.user.id}>!`);
        const embed = new EmbedBuilder()
          .setColor('#5865F2')
          .setTitle(`🎟 Ticket #${numStr}`)
          .setDescription(`**Owner:** <@${interaction.user.id}>\n**Reason:** ${reason}`);

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('ticket_close').setLabel('Close Ticket').setStyle(ButtonStyle.Danger)
        );
        await chan.send({ embeds: [embed], components: [row] });
        return interaction.reply({ content: `Ticket created: ${chan}`, ephemeral: true });
      }
    }
  }
});

if (!process.env.DISCORD_TOKEN) {
  console.error('DISCORD_TOKEN missing!');
  process.exit(1);
}

client.login(process.env.DISCORD_TOKEN);
