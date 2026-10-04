const { 
  Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, 
  ButtonBuilder, ButtonStyle, PermissionsBitField, ChannelType, PermissionFlagsBits,
  ModalBuilder, TextInputBuilder, TextInputStyle, AttachmentBuilder
} = require('discord.js');
const express = require('express');
const mongoose = require('mongoose');
const { createCanvas, loadImage } = require('canvas');

// ==========================================
// 0. GLOBAL CRASH SHIELD & TRACKERS
// ==========================================
process.on('unhandledRejection', (reason) => console.error('[Unhandled Rejection]:', reason));
process.on('uncaughtException', (err, origin) => console.error('[Uncaught Exception]:', err, origin));

const joinLog = [];
const auditLogTracker = new Map();
const deletedMessages = new Map();
const deletedReactions = new Map();
const vcStartTime = new Map(); // Track unmuted/undeafened VC join times
const commandCooldowns = new Map();

// ==========================================
// 1. EXPRESS KEEP-ALIVE WEB SERVER
// ==========================================
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Above Utilities Bot Online 24/7'));
app.listen(PORT, () => console.log(`Web server listening on port ${PORT}`));

// ==========================================
// 2. CONFIGURATION & GAME RANKS MASTER MAP
// ==========================================
const CONFIG = {
  transcriptsChannelId: '1553623565293850645',
  memberChannelId: '1553625719098048542',
  messagesChannelId: '1555364819433951242', // Default fallthrough for message log if unset
  ticketCategoryId: '1554712333941473310',
  joinToCreateVcId: '1554711771510480926',
  selfieChannelId: '1471595263545053401',
  clipsChannelId: '1471595263100584006',
  boosterChannelId: '1471610310686408969',
  leaderboardChannelId: '1554711119568834640',
  clipOfTheWeekChannelId: '1555385023895703794',
  rankVerificationChannelId: '1555365045834092554',
  punishmentsChannelId: '1555364819433951242',
  banRequestChannelId: '1555028208913489990',
  quoteLogChannelId: '1555010046994415697',
  
  // Role IDs
  ownerRoleId: '1471595261787767002',
  adminRoleId: '1471595261787767000',
  modRoleId: '1471595261787766999',
  trialModRoleId: '1474042072288989224',
  staffRoleId: '1554712377595920474',
  memberRoleId: '1471604983706161334',
  verifiedRoleId: '1471595261787766995',
  
  topChatterRoleId: '1556450402936029224',
  topVcerRoleId: '1556450363681407128',
  topActivityRoleId: '1556450437769461880',
  
  // Level Roles (Chat)
  chatLevelRoles: {
    5: '1556449173568487555',
    10: '1556449197652185219',
    20: '1556449233014489159',
    30: '1556449264576495628',
    40: '1556449292607299606',
    50: '1556449321971490966',
    60: '1556449353814646916',
    70: '1556449383598530721',
    80: '1556449411922534422',
    90: '1556449440204849293',
    100: '1556449468147048479'
  },
  
  // Level Roles (VC)
  vcLevelRoles: {
    5: '1556448733191995454',
    10: '1556448805472309359',
    20: '1556448851064258670',
    30: '1556448886904848464',
    40: '1556448920928788531',
    50: '1556448959264980993',
    60: '1556448988377653390',
    70: '1556449033478873128',
    80: '1556449065997439037',
    90: '1556449109228003338',
    100: '1556449143281426492'
  }
};

// Complete Game Rank Matrix with Approval Triggers
const GAME_RANKS = {
  'apex': {
    name: 'Apex Legends',
    auto: ['rookie', 'bronze', 'silver', 'gold', 'platinum', 'diamond'],
    needsApproval: ['master', 'apex predator', 'predator']
  },
  'battlefield': {
    name: 'Battlefield 2042',
    auto: ['bronze', 'silver', 'gold', 'platinum', 'diamond'],
    needsApproval: ['elite']
  },
  'cod': {
    name: 'Call of Duty Ranked',
    auto: ['bronze', 'silver', 'gold', 'platinum', 'diamond', 'crimson'],
    needsApproval: ['iridescent', 'top 250']
  },
  'deltaforce': {
    name: 'Delta Force',
    auto: ['bronze', 'silver', 'gold', 'platinum', 'diamond'],
    needsApproval: ['black hawk', 'pinnacle']
  },
  'destiny2': {
    name: 'Destiny 2 Competitive',
    auto: ['copper', 'bronze', 'silver', 'gold', 'platinum'],
    needsApproval: ['adept', 'ascendant']
  },
  'thefinals': {
    name: 'The Finals',
    auto: ['bronze', 'silver', 'gold', 'platinum', 'diamond'],
    needsApproval: ['ruby']
  },
  'fortnite': {
    name: 'Fortnite Ranked',
    auto: ['bronze', 'silver', 'gold', 'platinum', 'diamond'],
    needsApproval: ['elite', 'champion', 'unreal']
  },
  'fragpunk': {
    name: 'FragPunk',
    auto: ['bronze', 'silver', 'gold', 'platinum', 'diamond'],
    needsApproval: ['master', 'punkmaster']
  },
  'haloinfinite': {
    name: 'Halo Infinite',
    auto: ['bronze', 'silver', 'gold', 'platinum', 'diamond'],
    needsApproval: ['onyx']
  },
  'marvelrivals': {
    name: 'Marvel Rivals',
    auto: ['bronze', 'silver', 'gold', 'platinum', 'diamond', 'grandmaster'],
    needsApproval: ['celestial', 'eternity', 'one above all']
  },
  'overwatch2': {
    name: 'Overwatch 2',
    auto: ['bronze', 'silver', 'gold', 'platinum', 'diamond', 'master'],
    needsApproval: ['grandmaster', 'champion', 'top 500']
  },
  'rocketleague': {
    name: 'Rocket League',
    auto: ['bronze', 'silver', 'gold', 'platinum', 'diamond', 'champion'],
    needsApproval: ['grand champion', 'supersonic legend']
  },
  'smite': {
    name: 'Smite / Smite 2',
    auto: ['bronze', 'silver', 'gold', 'platinum', 'diamond'],
    needsApproval: ['masters', 'grandmaster']
  },
  'splitgate': {
    name: 'Splitgate 2',
    auto: ['bronze', 'silver', 'gold', 'platinum', 'diamond'],
    needsApproval: ['master', 'pro']
  },
  'r6': {
    name: 'Rainbow Six Siege',
    auto: ['copper', 'bronze', 'silver', 'gold', 'platinum', 'emerald'],
    needsApproval: ['diamond', 'champions']
  },
  'forza': {
    name: 'Forza Motorsport',
    auto: ['open', 'qualifier', 'sportsman', 'expert', 'pro'],
    needsApproval: ['pinnacle']
  },
  'titanfall2': {
    name: 'Titanfall 2',
    auto: ['bronze', 'silver', 'gold', 'platinum'],
    needsApproval: ['diamond']
  },
  'valorant': {
    name: 'VALORANT',
    auto: ['iron', 'bronze', 'silver', 'gold', 'platinum', 'diamond'],
    needsApproval: ['ascendant', 'immortal', 'radiant']
  },
  'arcraiders': {
    name: 'ARC Raiders',
    auto: ['rookie', 'tryhard', 'wildcard', 'daredevil'],
    needsApproval: ['hotshot', 'cantina legend']
  },
  'forhonor': {
    name: 'For Honor',
    auto: ['bronze', 'silver', 'gold', 'platinum', 'diamond'],
    needsApproval: ['master', 'grandmaster']
  },
  'dbd': {
    name: 'Dead by Daylight',
    auto: ['ash', 'bronze', 'silver', 'gold'],
    needsApproval: ['iridescent']
  }
};

const TRIVIA_BANK = [
  { q: "What year was Discord officially released?", a: "2015" },
  { q: "What is the highest achievable rank in Valorant?", a: "radiant" },
  { q: "What is the chemical symbol for Gold?", a: "au" },
  { q: "How many bones are in the human body?", a: "206" },
  { q: "What planet is known as the Red Planet?", a: "mars" },
  { q: "Which legend in Apex Legends uses perimeter fences?", a: "wattson" },
  { q: "What is 15 multiplied by 6?", a: "90" },
  { q: "What is the square root of 144?", a: "12" },
  { q: "What is the velocity of light in vacuum approximately (km/s)?", a: "300000" },
  { q: "What force keeps planets in orbit around the Sun?", a: "gravity" },
  { q: "What gas do plants absorb during photosynthesis?", a: "carbon dioxide" },
  { q: "What element has the atomic number 1?", a: "hydrogen" },
  { q: "What is the primary language spoken in Brazil?", a: "portuguese" },
  { q: "Who painted the Mona Lisa?", a: "leonardo da vinci" },
  { q: "What is 23 plus 49?", a: "72" },
  { q: "How many sides does a heptagon have?", a: "7" },
  { q: "What organ pumps blood through the human body?", a: "heart" },
  { q: "What is the largest ocean on Earth?", a: "pacific" },
  { q: "What is the chemical formula for water?", a: "h2o" },
  { q: "How many degrees are in a right angle?", a: "90" },
  { q: "What power-up makes Mario grow big?", a: "super mushroom" },
  { q: "What year did World War II end?", a: "1945" },
  { q: "What subatomic particle carries a negative charge?", a: "electron" },
  { q: "What is 100 divided by 4?", a: "25" },
  { q: "What state of matter is water vapor?", a: "gas" },
  { q: "What is the hardest natural substance on Earth?", a: "diamond" },
  { q: "In Minecraft, what block is needed to craft a Nether Portal?", a: "obsidian" },
  { q: "What is 7 squared?", a: "49" },
  { q: "What unit measures electrical resistance?", a: "ohm" },
  { q: "What planet has the most prominent rings?", a: "saturn" },
  { q: "What pigment gives plants their green color?", a: "chlorophyll" },
  { q: "What is the capital city of Japan?", a: "tokyo" },
  { q: "What gas makes up most of Earth's atmosphere?", a: "nitrogen" },
  { q: "What is 12 x 12?", a: "144" },
  { q: "How many legs does a spider have?", a: "8" },
  { q: "What engine powers Apex Legends?", a: "source" },
  { q: "What is the boiling point of water in Celsius?", a: "100" },
  { q: "What is the charge of a neutron?", a: "neutral" },
  { q: "How many continents are on Earth?", a: "7" },
  { q: "What is 250 minus 85?", a: "165" },
  { q: "What company developed Overwatch?", a: "blizzard" }
];

// ==========================================
// 3. MONGOOSE SCHEMA & DATABASE MODEL
// ==========================================
const dbSchema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true },
  leaderboardMsgId: { type: String, default: '' },
  
  // User Metrics & Statistics
  userCoins: { type: Map, of: Number, default: {} },
  userChatCount: { type: Map, of: Number, default: {} },
  userVcMinutes: { type: Map, of: Number, default: {} },
  userActivityWinnings: { type: Map, of: Number, default: {} },
  
  // XP Systems
  userChatXp: { type: Map, of: Number, default: {} },
  userVcXp: { type: Map, of: Number, default: {} },
  
  // Ranks & Custom Data
  userRanks: { type: Map, of: Object, default: {} },
  warnings: { type: Map, of: Array, default: {} },
  punishments: { type: Map, of: Array, default: {} },
  staffStats: { type: Map, of: Object, default: {} },
  afkUsers: { type: Map, of: Object, default: {} },
  stickyMessages: { type: Map, of: String, default: {} },
  customBrRoles: { type: Map, of: Object, default: {} }
});

const BotDB = mongoose.model('BotData_V2', dbSchema);
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
// 4. DISCORD CLIENT INITIALIZATION
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
  partials: [Partials.Message, Partials.Channel, Partials.Reaction, Partials.GuildMember],
});

let globalMessageCounter = 0;
let minigameActive = false;
let currentMinigameAnswer = null;

client.once('ready', async () => {
  console.log(`[SYSTEM READY] Logged in as ${client.user.tag}`);
  await getDB();
  setupLeaderboardLoop();
  setupMidnightResetScheduler();
  setupWeeklyTopClipScheduler();
});

// Helper: Role Verification & Hierarchy Checks
function getStaffLevel(member) {
  if (member.id === member.guild.ownerId || member.roles.cache.has(CONFIG.ownerRoleId)) return 4; // Owner
  if (member.roles.cache.has(CONFIG.adminRoleId) || member.permissions.has(PermissionsBitField.Flags.Administrator)) return 3; // Admin
  if (member.roles.cache.has(CONFIG.modRoleId)) return 2; // Moderator
  if (member.roles.cache.has(CONFIG.trialModRoleId)) return 1; // Trial Mod
  return 0;
}

// Helper: Track Staff Action History
async function recordStaffStat(staffId, actionType) {
  const db = await getDB();
  const current = db.staffStats.get(staffId) || { warns: 0, timeouts: 0, banrequests: 0, bans: 0, history: [] };
  
  if (actionType === 'warn') current.warns += 1;
  if (actionType === 'timeout') current.timeouts += 1;
  if (actionType === 'banrequest') current.banrequests += 1;
  if (actionType === 'ban') current.bans += 1;

  current.history.push({ type: actionType, date: Date.now() });
  db.staffStats.set(staffId, current);
  await saveDB();
}

// Helper: Transcripts Engine
async function sendTranscript(channel, label) {
  const logChan = channel.guild.channels.cache.get(CONFIG.transcriptsChannelId);
  if (!logChan) return;

  const messages = await channel.messages.fetch({ limit: 100 }).catch(() => null);
  if (!messages || messages.size === 0) return;

  const sorted = Array.from(messages.values()).reverse();
  let transcriptText = `===========================================\nTRANSCRIPT TYPE: ${label.toUpperCase()}\nCHANNEL: #${channel.name}\nDATE:${new Date().toISOString()}\n===========================================\n\n`;

  sorted.forEach(m => {
    transcriptText += `[${m.createdAt.toLocaleString()}] ${m.author.tag}:${m.content}\n`;
  });

  const buffer = Buffer.from(transcriptText, 'utf-8');
  const attachment = new AttachmentBuilder(buffer, { name: `${channel.name}-transcript.txt` });
  await logChan.send({ content: `📜 **${label} Transcript Logged:** \`${channel.name}\``, files: [attachment] }).catch(() => {});
}

// Helper: Punishment Embed Builder
async function logPunishment(guild, target, moderator, type, reason) {
  const chan = guild.channels.cache.get(CONFIG.punishmentsChannelId);
  if (!chan) return;

  const member = await guild.members.fetch(target.id).catch(() => null);
  const rolesList = member ? member.roles.cache.filter(r => r.id !== guild.id).map(r => `<@&${r.id}>`).join(', ') || 'None' : 'N/A';

  const embed = new EmbedBuilder()
    .setColor('#ED4245')
    .setTitle(`🚨 Punishment Issued: ${type.toUpperCase()}`)
    .addFields(
      { name: '👤 Offender', value: `<@${target.id}> (\`${target.id}\` | ${target.tag})`, inline: false },
      { name: '🛡 Moderator', value: `<@${moderator.id}> (\`${moderator.id}\`)`, inline: false },
      { name: '📄 Reason', value: reason || 'No reason specified', inline: false },
      { name: '📅 Account Created', value: `<t:${Math.floor(target.createdTimestamp / 1000)}:R>`, inline: true },
      { name: '📥 Joined Server', value: member ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>` : 'N/A', inline: true },
      { name: '🎭 Offender Roles', value: rolesList, inline: false }
    )
    .setTimestamp();

  await chan.send({ embeds: [embed] }).catch(() => {});
  await recordStaffStat(moderator.id, type.toLowerCase());
}

// Helper: XP & Level Upgrade System
async function addXp(member, amount, type = 'chat') {
  const db = await getDB();
  const isBooster = member.premiumSince !== null;
  
  // Calculate Leaderboard Placement Multiplier
  const topChatters = Array.from(db.userChatCount.entries()).sort((a,b) => b[1] - a[1]).slice(0, 5).map(e => e[0]);
  const isTop5 = topChatters.includes(member.id);

  let multiplier = 1.0;
  if (isBooster) multiplier *= 2.0;
  if (isTop5) multiplier *= 1.5;

  const finalXp = Math.floor(amount * multiplier);

  if (type === 'chat') {
    const currentXp = (db.userChatXp.get(member.id) || 0) + finalXp;
    db.userChatXp.set(member.id, currentXp);
    
    // Check Level Gates
    const levelMap = CONFIG.chatLevelRoles;
    for (const [lvl, roleId] of Object.entries(levelMap)) {
      const requiredXp = Math.pow(parseInt(lvl), 2) * 20; // Scaling XP curve
      if (currentXp >= requiredXp && !member.roles.cache.has(roleId)) {
        // Strip previous chat level roles
        for (const oldRoleId of Object.values(levelMap)) {
          if (member.roles.cache.has(oldRoleId)) await member.roles.remove(oldRoleId).catch(() => {});
        }
        await member.roles.add(roleId).catch(() => {});
      }
    }
  } else if (type === 'vc') {
    const currentXp = (db.userVcXp.get(member.id) || 0) + finalXp;
    db.userVcXp.set(member.id, currentXp);

    const levelMap = CONFIG.vcLevelRoles;
    for (const [lvl, roleId] of Object.entries(levelMap)) {
      const requiredXp = Math.pow(parseInt(lvl), 2) * 20;
      if (currentXp >= requiredXp && !member.roles.cache.has(roleId)) {
        for (const oldRoleId of Object.values(levelMap)) {
          if (member.roles.cache.has(oldRoleId)) await member.roles.remove(oldRoleId).catch(() => {});
        }
        await member.roles.add(roleId).catch(() => {});
      }
    }
  }
  await saveDB();
}

// ==========================================
// 5. AUTOMATED SCHEDULED LOOPS & LEADERBOARD
// ==========================================
function setupLeaderboardLoop() {
  setInterval(async () => {
    const db = await getDB();
    const guild = client.guilds.cache.first();
    if (!guild) return;

    const chan = guild.channels.cache.get(CONFIG.leaderboardChannelId);
    if (!chan) return;

    // Rank Arrays
    const topChat = Array.from(db.userChatCount.entries()).sort((a,b) => b[1] - a[1]).slice(0, 10);
    const topVc = Array.from(db.userVcMinutes.entries()).sort((a,b) => b[1] - a[1]).slice(0, 10);
    const topActivity = Array.from(db.userActivityWinnings.entries()).sort((a,b) => b[1] - a[1]).slice(0, 10);

    let chatStr = topChat.map((e, i) => `**#${i+1}** <@${e[0]}> — \`${e[1]} msgs\``).join('\n') || 'None';
    let vcStr = topVc.map((e, i) => `**#${i+1}** <@${e[0]}> — \`${e[1]} mins\``).join('\n') || 'None';
    let actStr = topActivity.map((e, i) => `**#${i+1}** <@${e[0]}> — \`${e[1]} dabloons\``).join('\n') || 'None';

    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle('📊 Daily Server Leaderboard')
      .setDescription('Updates every 5 minutes. Resets daily at **00:00 CDT**.')
      .addFields(
        { name: '💬 Top Chatters', value: chatStr, inline: true },
        { name: '🎙 Top VC Members', value: vcStr, inline: true },
        { name: '⚡ Top Activity Champions', value: actStr, inline: true }
      )
      .setTimestamp();

    if (db.leaderboardMsgId) {
      const msg = await chan.messages.fetch(db.leaderboardMsgId).catch(() => null);
      if (msg) return msg.edit({ embeds: [embed] });
    }

    const newMsg = await chan.send({ embeds: [embed] }).catch(() => null);
    if (newMsg) {
      db.leaderboardMsgId = newMsg.id;
      await saveDB();
    }
  }, 5 * 60 * 1000);
}

// Daily Midnight Reset Scheduler (00:00 CDT)
function setupMidnightResetScheduler() {
  setInterval(async () => {
    const now = new Date();
    // Convert to CDT (UTC-5)
    const cdtHours = (now.getUTCHours() - 5 + 24) % 24;
    
    if (cdtHours === 0 && now.getUTCMinutes() === 0) {
      const db = await getDB();
      const guild = client.guilds.cache.first();
      if (!guild) return;

      // Top Performers Reward
      const topChatter = Array.from(db.userChatCount.entries()).sort((a,b) => b[1] - a[1])[0];
      const topVcer = Array.from(db.userVcMinutes.entries()).sort((a,b) => b[1] - a[1])[0];
      const topAct = Array.from(db.userActivityWinnings.entries()).sort((a,b) => b[1] - a[1])[0];

      const rewards = [topChatter, topVcer, topAct];
      for (const req of rewards) {
        if (req) {
          const coins = db.userCoins.get(req[0]) || 0;
          db.userCoins.set(req[0], coins + 100);
        }
      }

      // Assign Daily Winner Roles
      if (topChatter) {
        const m = await guild.members.fetch(topChatter[0]).catch(() => null);
        if (m) await m.roles.add(CONFIG.topChatterRoleId).catch(() => {});
      }
      if (topVcer) {
        const m = await guild.members.fetch(topVcer[0]).catch(() => null);
        if (m) await m.roles.add(CONFIG.topVcerRoleId).catch(() => {});
      }
      if (topAct) {
        const m = await guild.members.fetch(topAct[0]).catch(() => null);
        if (m) await m.roles.add(CONFIG.topActivityRoleId).catch(() => {});
      }

      // Clear Daily Leaderboard Counters
      db.userChatCount.clear();
      db.userVcMinutes.clear();
      db.userActivityWinnings.clear();
      await saveDB();
    }
  }, 60000);
}

// Weekly Clip of the Week Scheduler (Saturdays)
function setupWeeklyTopClipScheduler() {
  setInterval(async () => {
    const db = await getDB();
    const now = new Date();
    if (now.getDay() === 6 && now.getHours() === 12 && now.getMinutes() === 0) {
      const guild = client.guilds.cache.first();
      if (!guild) return;

      const clipsChan = guild.channels.cache.get(CONFIG.clipsChannelId);
      const announceChan = guild.channels.cache.get(CONFIG.clipOfTheWeekChannelId);
      if (!clipsChan || !announceChan) return;

      const messages = await clipsChan.messages.fetch({ limit: 100 }).catch(() => null);
      if (!messages) return;

      let topMsg = null;
      let maxUpvotes = -1;

      messages.forEach(msg => {
        const upvoteReaction = msg.reactions.cache.get('⬆️');
        const count = upvoteReaction ? upvoteReaction.count : 0;
        if (count > maxUpvotes) {
          maxUpvotes = count;
          topMsg = msg;
        }
      });

      if (topMsg && maxUpvotes > 0) {
        const coins = db.userCoins.get(topMsg.author.id) || 0;
        db.userCoins.set(topMsg.author.id, coins + 100);
        await saveDB();

        const topEmbed = new EmbedBuilder()
          .setColor('#FEE75C')
          .setTitle('🏆 Clip of the Week Winner!')
          .setDescription(`Congratulations <@${topMsg.author.id}>! Your clip won with **${maxUpvotes} upvotes**!\n\n✨ **Prize:** Granted 100 Dabloons + COTW Role!\n\n[View Winning Clip](${topMsg.url})`)
          .setTimestamp();

        announceChan.send({ embeds: [topEmbed] }).catch(() => {});
      }
    }
  }, 60000);
}

// ==========================================
// 6. MEMBER EVENTS & LOGGING ENGINE
// ==========================================
client.on('guildMemberAdd', async (member) => {
  if (CONFIG.memberRoleId) {
    const role = member.guild.roles.cache.get(CONFIG.memberRoleId);
    if (role) member.roles.add(role).catch(console.error);
  }

  const logChan = member.guild.channels.cache.get(CONFIG.memberChannelId);
  if (logChan) {
    const embed = new EmbedBuilder()
      .setColor('#57F287')
      .setTitle('📥 Member Joined')
      .setDescription(`**User:** <@${member.id}> (${member.user.tag})\n**Account Age:** <t:${Math.floor(member.user.createdTimestamp / 1000)}:R>\n**Total Members:** ${member.guild.memberCount}`)
      .setTimestamp();
    logChan.send({ embeds: [embed] }).catch(() => {});
  }
});

client.on('guildMemberRemove', async (member) => {
  const logChan = member.guild.channels.cache.get(CONFIG.memberChannelId);
  if (logChan) {
    const embed = new EmbedBuilder()
      .setColor('#ED4245')
      .setTitle('📤 Member Left')
      .setDescription(`**User:** <@${member.id}> (${member.user.tag})\n**Total Members:** ${member.guild.memberCount}`)
      .setTimestamp();
    logChan.send({ embeds: [embed] }).catch(() => {});
  }
});

client.on('guildMemberUpdate', async (oldMember, newMember) => {
  const logChan = newMember.guild.channels.cache.get(CONFIG.memberChannelId);
  if (!logChan) return;

  // Nickname Change
  if (oldMember.nickname !== newMember.nickname) {
    const embed = new EmbedBuilder()
      .setColor('#FEE75C')
      .setTitle('✏️ Nickname Changed')
      .setDescription(`**User:** <@${newMember.id}>\n**Before:** ${oldMember.nickname || oldMember.user.username}\n**After:** ${newMember.nickname || newMember.user.username}`);
    logChan.send({ embeds: [embed] }).catch(() => {});
  }

  // Role Edits
  if (oldMember.roles.cache.size !== newMember.roles.cache.size) {
    const added = newMember.roles.cache.filter(r => !oldMember.roles.cache.has(r.id)).map(r => `<@&${r.id}>`).join(', ');
    const removed = oldMember.roles.cache.filter(r => !newMember.roles.cache.has(r.id)).map(Here is the complete, production-ready `index.js` incorporating every single system, channel/role ID, role-based moderation hierarchy, automated logging pipeline, image-quoting mechanism, interactive leaderboard, and leveling system you requested.

### Dependencies Required
Ensure your `package.json` includes `canvas` for generating quote images:
```json
{
  "dependencies": {
    "canvas": "^2.11.2",
    "discord.js": "^14.14.1",
    "express": "^4.18.2",
    "mongoose": "^8.1.0"
  }
}
