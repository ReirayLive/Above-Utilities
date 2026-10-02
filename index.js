const { 
  Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, 
  ButtonBuilder, ButtonStyle, PermissionsBitField, ChannelType, PermissionFlagsBits,
  ModalBuilder, TextInputBuilder, TextInputStyle, AttachmentBuilder
} = require('discord.js');
const express = require('express');
const mongoose = require('mongoose');

// ==========================================
// 0. GLOBAL CRASH SHIELD
// ==========================================
process.on('unhandledRejection', (reason) => console.error('[Unhandled Rejection]:', reason));
process.on('uncaughtException', (err, origin) => console.error('[Uncaught Exception]:', err, origin));

// ==========================================
// 1. EXPRESS KEEP-ALIVE WEB SERVER
// ==========================================
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Bot Online 24/7'));
app.listen(PORT, () => console.log(`Web server listening on port ${PORT}`));

// ==========================================
// 2. MONGOOSE DATABASE SCHEMA & MODEL
// ==========================================
const dbSchema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true },
  config: {
    prefixes: { type: [String], default: [',', '?', '!'] },
    quoteChannelId: { type: String, default: '1555010046994415697' },
    clipsChannelId: { type: String, default: '1471595263100584006' },
    topClipChannelId: { type: String, default: '1555385023895703794' },
    boostChannelId: { type: String, default: '1471610310686408969' },
    selfiesChannelId: { type: String, default: '' }, // Set via ,config selfiesChannelId <id>
    backupChannelId: { type: String, default: '1555358918463594646' },
    banRequestChannelId: { type: String, default: '1555028208913489990' },
    punishmentLogChannelId: { type: String, default: '1555364819433951242' },
    verificationLogChannelId: { type: String, default: '1555365045834092554' },
    transcriptsChannelId: { type: String, default: '1553623565293850645' },
    ticketCategoryId: { type: String, default: '1554712333941473310' },
    ownerRoleId: { type: String, default: '1471595261787767002' },
    staffRoleId: { type: String, default: '1554712377595920474' },
    verifiedRoleId: { type: String, default: '1471595261787766995' },
    autoRoleId: { type: String, default: '1471604983706161334' },
    joinToCreateVcId: { type: String, default: '1554711771510480926' },
    mainChatId: { type: String, default: '' },
  },
  ticketCounter: { type: Number, default: 0 },
  userRanks: { type: Map, of: Object, default: {} },
  userCoins: { type: Map, of: Number, default: {} },
  warnings: { type: Map, of: Array, default: {} },
  punishments: { type: Map, of: Array, default: {} },
  afkUsers: { type: Map, of: Object, default: {} },
  stickyMessages: { type: Map, of: String, default: {} },
});

const BotDB = mongoose.model('BotData', dbSchema);
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
// 3. DISCORD CLIENT CONFIGURATION
// ==========================================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessageReactions,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

const deletedMessages = new Map();
let globalMessageCounter = 0;
let minigameActive = false;
let currentMinigameAnswer = null;

const TRIVIA_BANK = [
  { q: "What year was Discord officially released?", a: "2015" },
  { q: "What is the highest achievable rank in Valorant?", a: "radiant" },
  { q: "What is the chemical symbol for Gold?", a: "au" },
  { q: "How many bones are in the human body?", a: "206" },
  { q: "What planet is known as the Red Planet?", a: "mars" },
  { q: "Which game features a legend named Wattson?", a: "apex legends" },
  { q: "What is 15 multiplied by 6?", a: "90" }
];

client.once('ready', async () => {
  console.log(`[SYSTEM READY] Logged in as ${client.user.tag}`);
  await getDB();
  setupWeeklyTopClipScheduler();
});

// Helper: Transcripts
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
  const attachment = new AttachmentBuilder(buffer, { name: `${channel.name}-transcript.txt` });
  await logChan.send({ content: `📜 **${label} Transcript Logged:** \`${channel.name}\``, files: [attachment] }).catch(() => {});
}

// Helper: Punishment Logging
async function logPunishment(guild, title, desc) {
  const db = await getDB();
  if (!db.config.punishmentLogChannelId) return;
  const chan = guild.channels.cache.get(db.config.punishmentLogChannelId);
  if (!chan) return;

  const embed = new EmbedBuilder().setColor('#ED4245').setTitle(title).setDescription(desc).setTimestamp();
  chan.send({ embeds: [embed] }).catch(() => {});
}

// Helper: Weekly Top Clip Scheduler
function setupWeeklyTopClipScheduler() {
  setInterval(async () => {
    const db = await getDB();
    const now = new Date();
    if (now.getDay() === 0 && now.getHours() === 12 && now.getMinutes() === 0) { // Weekly Sunday Check
      for (const guild of client.guilds.cache.values()) {
        const clipsChan = guild.channels.cache.get(db.config.clipsChannelId);
        const announceChan = guild.channels.cache.get(db.config.topClipChannelId);
        if (!clipsChan || !announceChan) continue;

        const messages = await clipsChan.messages.fetch({ limit: 50 }).catch(() => null);
        if (!messages) continue;

        let topMsg = null;
        let maxUpvotes = -1;

        messages.forEach(msg => {
          const upvoteReaction = msg.reactions.cache.get('👍');
          const count = upvoteReaction ? upvoteReaction.count : 0;
          if (count > maxUpvotes) {
            maxUpvotes = count;
            topMsg = msg;
          }
        });

        if (topMsg && maxUpvotes > 0) {
          const topEmbed = new EmbedBuilder()
            .setColor('#FEE75C')
            .setTitle('🏆 Top Clip of the Week!')
            .setDescription(`Posted by <@${topMsg.author.id}> with **${maxUpvotes} upvotes**!\n\n[Jump to Clip](${topMsg.url})`)
            .setTimestamp();
          announceChan.send({ embeds: [topEmbed] }).catch(() => {});
        }
      }
    }
  }, 60000);
}

// ==========================================
// 4. MEMBER EVENTS & BOOST DETECTION
// ==========================================
client.on('guildMemberAdd', async (member) => {
  const db = await getDB();
  member.send(`Welcome to **${member.guild.name}**! Enjoy your stay.`).catch(() => {});

  if (db.config.autoRoleId) {
    const role = member.guild.roles.cache.get(db.config.autoRoleId);
    if (role) member.roles.add(role).catch(console.error);
  }
  logPunishment(member.guild, '📥 Member Joined', `User: <@${member.id}> (${member.user.tag})`);
});

client.on('guildMemberUpdate', async (oldMember, newMember) => {
  const db = await getDB();
  const oldStatus = oldMember.premiumSince;
  const newStatus = newMember.premiumSince;

  if (!oldStatus && newStatus) {
    const boostChan = newMember.guild.channels.cache.get(db.config.boostChannelId);
    if (boostChan) {
      const boostEmbed = new EmbedBuilder()
        .setColor('#F47FFF')
        .setTitle('🚀 Server Boosted!')
        .setDescription(`Thank you so much <@${newMember.id}> for boosting and supporting the server!\n\nMake sure to claim and enjoy your **Battle Royale Roles**!`);
      boostChan.send({ embeds: [boostEmbed] }).catch(() => {});
    }
  }
});

// ==========================================
// 5. VOICE CHANNELS (JOIN TO CREATE)
// ==========================================
client.on('voiceStateUpdate', async (oldState, newState) => {
  const db = await getDB();
  if (newState.channelId && newState.channelId === db.config.joinToCreateVcId) {
    const guild = newState.guild;
    const user = newState.member.user;

    const createdChannel = await guild.channels.create({
      name: `🔊 ${user.username}'s Room`,
      type: ChannelType.GuildVoice,
      parent: newState.channel.parentId,
      permissionOverwrites: [
        { id: user.id, allow: [PermissionFlagsBits.ManageChannels, PermissionFlagsBits.MoveMembers, PermissionFlagsBits.Connect] },
      ],
    }).catch(console.error);

    if (createdChannel) {
      await newState.setChannel(createdChannel).catch(console.error);

      const menuEmbed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle('🎙️ Voice Control Panel')
        .setDescription('Manage your temporary voice channel using the buttons below or commands:\n• `,permit @user`\n• `,kick @user`');

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('vc_lock').setLabel('🔒 Lock').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('vc_unlock').setLabel('🔓 Unlock').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('vc_hide').setLabel('👁 Hide').setStyle(ButtonStyle.Danger)
      );

      await createdChannel.send({ embeds: [menuEmbed], components: [row] }).catch(console.error);
    }
  }

  if (oldState.channel && oldState.channel.name.startsWith('🔊 ') && oldState.channel.members.size === 0) {
    await sendTranscript(oldState.channel, 'VC Chat');
    await oldState.channel.delete().catch(() => {});
  }
});

// ==========================================
// 6. MESSAGE TRACKER, AUTOMOD & COMMANDS
// ==========================================
client.on('messageDelete', (message) => {
  if (message.author?.bot) return;
  deletedMessages.set(message.channel.id, {
    content: message.content || 'Media/Embed Message',
    author: message.author,
    time: message.createdAt,
    image: message.attachments.first()?.proxyURL || null,
  });
});

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;
  const db = await getDB();

  // Selfies Channel Enforcement (Deletes plain text messages, adds crown to embeds/attachments)
  if (db.config.selfiesChannelId && message.channel.id === db.config.selfiesChannelId) {
    const hasMedia = message.attachments.size > 0 || message.embeds.length > 0;
    if (!hasMedia) {
      await message.delete().catch(() => {});
      return;
    } else {
      await message.react('👑').catch(() => {});
    }
  }

  // Clips Channel Enforcement
  if (db.config.clipsChannelId && message.channel.id === db.config.clipsChannelId) {
    const hasMedia = message.attachments.size > 0 || message.content.includes('http://') || message.content.includes('https://');
    if (!hasMedia) {
      await message.delete().catch(() => {});
      return;
    } else {
      await message.react('👍').catch(() => {});
      await message.react('👎').catch(() => {});
    }
  }

  // Fixed Sticky Message System
  if (db.stickyMessages.get(message.channel.id)) {
    const stickyText = db.stickyMessages.get(message.channel.id);
    const msgs = await message.channel.messages.fetch({ limit: 5 }).catch(() => null);
    if (msgs) {
      const lastSticky = msgs.find(m => m.author.id === client.user.id && m.content.startsWith('📌 **Sticky Note:**'));
      if (lastSticky) await lastSticky.delete().catch(() => {});
    }
    await message.channel.send(`📌 **Sticky Note:**\n${stickyText}`).catch(() => {});
  }

  // AFK Check
  if (db.afkUsers.has(message.author.id)) {
    const afkData = db.afkUsers.get(message.author.id);
    const durationMs = Date.now() - (afkData.timestamp || Date.now());
    const minutes = Math.floor(durationMs / 60000);
    const seconds = Math.floor((durationMs % 60000) / 1000);
    const timeFormatted = minutes > 0 ? `${minutes}m${seconds}s` : `${seconds}s`;

    db.afkUsers.delete(message.author.id);
    await saveDB();

    message.reply(`Welcome back! You were AFK for **${timeFormatted}**.`)
      .then(m => setTimeout(() => m.delete().catch(() => {}), 10000))
      .catch(() => {});
  }

  // Coins & Trivia
  globalMessageCounter++;
  if (globalMessageCounter % 100 === 0) {
    const currentCoins = db.userCoins.get(message.author.id) || 0;
    db.userCoins.set(message.author.id, currentCoins + 10);
    await saveDB();
    message.channel.send(`🎉 **100 Messages Hit!** <@${message.author.id}> earned **10 coins**!`).catch(() => {});
  }

  const isMainChat = db.config.mainChatId ? message.channel.id === db.config.mainChatId : true;
  if (isMainChat && globalMessageCounter % 40 === 0 && !minigameActive) {
    minigameActive = true;
    const selectedTrivia = TRIVIA_BANK[Math.floor(Math.random() * TRIVIA_BANK.length)];
    currentMinigameAnswer = selectedTrivia.a.toLowerCase();

    const minigameMsg = await message.channel.send(`⚡ **TRIVIA:** ${selectedTrivia.q}\n*Type the answer first for **15 coins**! (45s)*`).catch(() => {});

    setTimeout(async () => {
      if (minigameActive) {
        minigameActive = false;
        currentMinigameAnswer = null;
        if (minigameMsg) await minigameMsg.delete().catch(() => {});
      }
    }, 45000);
  }

  if (minigameActive && isMainChat && message.content.trim().toLowerCase() === currentMinigameAnswer) {
    minigameActive = false;
    currentMinigameAnswer = null;
    const currentCoins = db.userCoins.get(message.author.id) || 0;
    db.userCoins.set(message.author.id, currentCoins + 15);
    await saveDB();
    message.reply('🎉 Correct! You won **15 coins**!').catch(() => {});
  }

  // Command Handler
  const usedPrefix = db.config.prefixes.find(p => message.content.startsWith(p));
  if (!usedPrefix) return;

  const args = message.content.slice(usedPrefix.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  // HELP COMMAND
  if (command === 'help') {
    const helpEmbed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle('📚 Server Command List')
      .addFields(
        { name: '🛠 Moderation', value: '`,warn`, `,warnings`, `,timeout`, `,ban`, `,banrequest`, `,punishments`' },
        { name: '🎮 Gaming Ranks', value: '`,setrank <game> <rank>`, `,rank [@user]`, `,removerank <game>`' },
        { name: '💰 Economy & Fun', value: '`,bal`, `,coins`, `,afk`, `,s` / `,snipe`' },
        { name: '🎙 Voice Chat', value: '`,permit @user`, `,kick @user`' },
        { name: '📌 Utility', value: '`,sticky <text>`, `,unsticky`, `,selfie`, `,ticket`' }
      );
    return message.channel.send({ embeds: [helpEmbed] });
  }

  // ECONOMY / BALANCE
  if (command === 'bal' || command === 'balance' || command === 'coins') {
    const target = message.mentions.users.first() || message.author;
    const coins = db.userCoins.get(target.id) || 0;
    return message.reply(`🪙 **${target.username}** currently has **${coins} coins**.`);
  }

  // RANK REMOVAL
  if (command === 'removerank' || command === 'delrank' || command === 'deleterank') {
    const game = args[0]?.toLowerCase();
    if (!game) return message.reply('Usage: `,removerank <game>`');

    const profile = db.userRanks.get(message.author.id);
    if (!profile || !profile[game]) return message.reply(`❌ You do not have a rank saved for **${game.toUpperCase()}**.`);

    delete profile[game];
    db.userRanks.set(message.author.id, profile);
    await saveDB();
    return message.reply(`✅ Removed your rank for **${game.toUpperCase()}**.`);
  }

  // STICKY / UNSTICKY
  if (command === 'sticky') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) return;
    const text = args.join(' ');
    if (!text) return message.reply('Usage: `,sticky <text>`');

    db.stickyMessages.set(message.channel.id, text);
    await saveDB();
    message.delete().catch(() => {});
    return message.channel.send(`📌 **Sticky Note:**\n${text}`);
  }

  if (command === 'unsticky') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) return;
    db.stickyMessages.delete(message.channel.id);
    await saveDB();
    return message.reply('✅ Removed sticky note from this channel.');
  }

  // MODERATION COMMANDS
  if (command === 'warn') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return;
    const target = message.mentions.members.first();
    const reason = args.slice(1).join(' ') || 'No reason provided';
    if (!target) return message.reply('Usage: `,warn @user <reason>`');

    const userWarns = db.warnings.get(target.id) || [];
    userWarns.push({ reason, moderator: message.author.tag, date: new Date().toLocaleDateString() });
    db.warnings.set(target.id, userWarns);
    await saveDB();

    logPunishment(message.guild, '⚠️ Member Warned', `User: <@${target.id}>\nModerator: <@${message.author.id}>\nReason:${reason}`);
    return message.reply(`⚠️ Warned <@${target.id}> for: *${reason}*`);
  }

  if (command === 'warnings') {
    const target = message.mentions.users.first() || message.author;
    const userWarns = db.warnings.get(target.id) || [];
    if (userWarns.length === 0) return message.reply(`**${target.username}** has 0 warnings.`);

    const warnEmbed = new EmbedBuilder().setColor('#FEE75C').setTitle(`⚠️ Warning Log — ${target.username}`);
    userWarns.forEach((w, idx) => warnEmbed.addFields({ name: `Warning #${idx + 1}`, value: `**Reason:** ${w.reason}\n**By:** ${w.moderator} (${w.date})` }));
    return message.channel.send({ embeds: [warnEmbed] });
  }

  if (command === 'timeout' || command === 'mute') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return;
    const target = message.mentions.members.first();
    const durationMins = parseInt(args[1]);
    const reason = args.slice(2).join(' ') || 'No reason provided';
    if (!target || isNaN(durationMins)) return message.reply('Usage: `,timeout @user <minutes> [reason]`');

    await target.timeout(durationMins * 60 * 1000, reason).catch(() => {});
    logPunishment(message.guild, '⏳ Member Timed Out', `User: <@${target.id}>\nDuration: ${durationMins}m\nReason:${reason}`);
    return message.reply(`⏳ Timed out <@${target.id}> for **${durationMins} minutes**.`);
  }

  if (command === 'ban') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.BanMembers)) return;
    const target = message.mentions.members.first();
    const reason = args.slice(1).join(' ') || 'No reason provided';
    if (!target) return message.reply('Usage: `,ban @user [reason]`');

    await target.ban({ reason }).catch(() => {});
    logPunishment(message.guild, '🔨 Member Banned', `User: <@${target.id}>\nModerator: <@${message.author.id}>\nReason:${reason}`);
    return message.reply(`🔨 Banned <@${target.id}>.`);
  }

  if (command === 'banrequest') {
    const target = message.mentions.users.first();
    const reason = args.slice(1).join(' ');
    if (!target || !reason) return message.reply('Usage: `,banrequest @user <reason>`');

    message.delete().catch(() => {});
    if (db.config.banRequestChannelId) {
      const banChan = message.guild.channels.cache.get(db.config.banRequestChannelId);
      if (banChan) {
        const banEmbed = new EmbedBuilder()
          .setColor('#ED4245')
          .setTitle('🚨 Ban Request Submitted')
          .setDescription(`Target: <@${target.id}>\nRequested By: <@${message.author.id}>\nReason:${reason}`);

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`banreq_approve_${target.id}`).setLabel('Approve Ban').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId(`banreq_deny_${target.id}`).setLabel('Deny Request').setStyle(ButtonStyle.Secondary)
        );

        banChan.send({ embeds: [banEmbed], components: [row] }).catch(() => {});
      }
    }
    return message.channel.send(`✅ Ban request submitted for <@${target.id}>.`);
  }

  if (command === 'punishments') {
    const target = message.mentions.users.first() || message.author;
    const userLogs = db.punishments.get(target.id) || [];
    if (userLogs.length === 0) return message.reply(`No punishment records found for **${target.username}**.`);

    const pEmbed = new EmbedBuilder().setColor('#ED4245').setTitle(`📜 Punishment History — ${target.username}`);
    userLogs.forEach((p, idx) => pEmbed.addFields({ name: `Log #${idx + 1}`, value: `**Type:** ${p.type}\n**Reason:** ${p.reason}` }));
    return message.channel.send({ embeds: [pEmbed] });
  }

  // VOICE CONTROLS
  if (command === 'permit') {
    if (!message.member.voice.channel || !message.member.voice.channel.name.startsWith('🔊 ')) return message.reply('❌ Must be in your temp voice room.');
    const target = message.mentions.members.first();
    if (!target) return message.reply('Usage: `,permit @user`');

    await message.member.voice.channel.permissionOverwrites.edit(target.id, { Connect: true, ViewChannel: true });
    return message.reply(`✅ Permitted <@${target.id}>.`);
  }

  if (command === 'kick') {
    if (!message.member.voice.channel || !message.member.voice.channel.name.startsWith('🔊 ')) return message.reply('❌ Must be in your temp voice room.');
    const target = message.mentions.members.first();
    if (!target) return message.reply('Usage: `,kick @user`');

    await message.member.voice.channel.permissionOverwrites.edit(target.id, { Connect: false });
    if (target.voice.channelId === message.member.voice.channel.id) await target.voice.disconnect().catch(() => {});
    return message.reply(`⛔ Kicked <@${target.id}>.`);
  }

  if (command === 'ping') {
    const sent = await message.reply('🏓 Pinging...').catch(console.error);
    if (!sent) return;
    return sent.edit(`🏓 **Pong!** Latency: \`${sent.createdTimestamp - message.createdTimestamp}ms\` | API: \`${Math.round(client.ws.ping)}ms\``);
  }

  if (command === 'selfie') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) return;
    message.delete().catch(() => {});
    const selfieEmbed = new EmbedBuilder()
      .setColor('#EB459E')
      .setTitle('🤳 Identity Verification Instructions')
      .setDescription(
        'To get verified, please post a photo in this channel following these instructions:\n\n' +
        '1. Send a selfie with your **face fully in the picture**.\n' +
        '2. Hold a paper showing our server name: `/above`.\n' +
        '3. Include today\'s **date** and your **Discord username** on the paper.\n\n' +
        'Staff will inspect your image and verify you shortly!'
      );
    return message.channel.send({ embeds: [selfieEmbed] });
  }

  if (command === 'ticket') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) return;
    message.delete().catch(() => {});
    const panelEmbed = new EmbedBuilder().setColor('#57F287').setTitle('🎟 Support Ticket Center').setDescription('Click below to open a private support ticket with staff.');
    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('open_ticket').setLabel('Create Ticket').setStyle(ButtonStyle.Primary).setEmoji('📩'));
    return message.channel.send({ embeds: [panelEmbed], components: [row] });
  }

  if (command === 'setrank') {
    const game = args[0]?.toLowerCase();
    const rank = args.slice(1).join(' ');
    if (!game || !rank) return message.reply(`Usage: \`${usedPrefix}setrank <game> <rank>\``);

    const topTierRanks = ['predator', 'radiant', 'grandmaster', 'champion', 'ssl', 'iridescent', 'top 250', 'godlike', 'unreal'];
    const isHighRank = topTierRanks.some(r => rank.toLowerCase().includes(r));
    const userProfile = db.userRanks.get(message.author.id) || {};

    if (isHighRank) {
      userProfile[game] = { rank, verified: false };
      db.userRanks.set(message.author.id, userProfile);
      await saveDB();

      if (db.config.verificationLogChannelId) {
        const vChan = message.guild.channels.cache.get(db.config.verificationLogChannelId);
        if (vChan) {
          const verifyEmbed = new EmbedBuilder()
            .setColor('#FEE75C')
            .setTitle('🎮 Top Rank Verification Claim')
            .setDescription(`User: <@${message.author.id}>\nGame: **${game.toUpperCase()}**\nClaimed Rank: **${rank}**`);

          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`verify_rank_approve_${message.author.id}_${game}`).setLabel('Approve Rank').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`verify_rank_deny_${message.author.id}_${game}`).setLabel('Deny Rank').setStyle(ButtonStyle.Danger)
          );
          vChan.send({ embeds: [verifyEmbed], components: [row] }).catch(() => {});
        }
      }
      return message.reply(`⚠️ **${rank}** requires verification! **Please open a support ticket** and send screenshot proof to staff so we can verify your rank.`);
    } else {
      userProfile[game] = { rank, verified: true };
      db.userRanks.set(message.author.id, userProfile);
      await saveDB();
      return message.reply(`✅ Your **${game.toUpperCase()}** rank has been saved as **${rank}**!`);
    }
  }

  if (command === 'rank') {
    const target = message.mentions.users.first() || message.author;
    const profile = db.userRanks.get(target.id);

    if (!profile || Object.keys(profile).length === 0) return message.reply(`**${target.username}** has no saved game ranks.`);

    const rankEmbed = new EmbedBuilder().setColor('#5865F2').setTitle(`🎮 Game Ranks — ${target.username}`).setThumbnail(target.displayAvatarURL({ dynamic: true }));
    for (const [game, data] of Object.entries(profile)) {
      const statusBadge = data.verified ? '✅' : '⏳ *(Pending Proof)*';
      rankEmbed.addFields({ name: game.toUpperCase(), value: `\`${data.rank}\` ${statusBadge}`, inline: true });
    }
    return message.channel.send({ embeds: [rankEmbed] });
  }

  if (command === 'snipe' || command === 's') {
    const sniped = deletedMessages.get(message.channel.id);
    if (!sniped) return message.reply('There is nothing to snipe!');

    const snipeEmbed = new EmbedBuilder()
      .setColor('#ED4245')
      .setAuthor({ name: sniped.author.tag, iconURL: sniped.author.displayAvatarURL() })
      .setDescription(sniped.content)
      .setTimestamp(sniped.time);

    if (sniped.image) snipeEmbed.setImage(sniped.image);
    return message.channel.send({ embeds: [snipeEmbed] });
  }

  if (command === 'afk') {
    const reason = args.join(' ') || 'AFK';
    db.afkUsers.set(message.author.id, { reason, timestamp: Date.now() });
    await saveDB();
    return message.reply(`Set your AFK: **${reason}**`);
  }

  if (command === 'config') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) return;
    const key = args[0];
    const val = args[1];

    if (!key || !(key in db.config)) return message.reply(`Valid keys: \`${Object.keys(db.config.toObject()).join(', ')}\``);

    db.config[key] = val;
    await saveDB();
    message.delete().catch(() => {});
    return message.channel.send(`✅ Setting **${key}** updated to \`${val}\`.`);
  }
});

// ==========================================
// 7. BUTTONS, MODALS & TICKET SYSTEM
// ==========================================
client.on('interactionCreate', async (interaction) => {
  const db = await getDB();

  if (interaction.isButton()) {
    if (interaction.customId === 'open_ticket') {
      const guild = interaction.guild;
      const user = interaction.user;

      db.ticketCounter += 1;
      await saveDB();

      const formattedNumber = String(db.ticketCounter).padStart(4, '0');
      const cleanUsername = user.username.toLowerCase().replace(/[^a-z0-9]/g, '');
      const channelName = `ticket-${cleanUsername}-${formattedNumber}`;

      const permissions = [
        { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
      ];

      if (db.config.ownerRoleId) permissions.push({ id: db.config.ownerRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] });
      if (db.config.staffRoleId) permissions.push({ id: db.config.staffRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] });

      const ticketChan = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: db.config.ticketCategoryId || null,
        permissionOverwrites: permissions,
      }).catch(console.error);

      if (ticketChan) {
        if (db.config.staffRoleId) ticketChan.send(`<@&${db.config.staffRoleId}> New ticket from <@${user.id}>!`).catch(() => {});

        const controlEmbed = new EmbedBuilder().setColor('#5865F2').setTitle(`⚙️ Ticket Panel — #${formattedNumber}`).setDescription(`Welcome <@${user.id}>! Staff will be with you shortly.`);

        const row1 = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('ticket_close').setLabel('Close').setStyle(ButtonStyle.Danger).setEmoji('🔒'),
          new ButtonBuilder().setCustomId('ticket_claim').setLabel('Claim').setStyle(ButtonStyle.Success).setEmoji('🙋'),
          new ButtonBuilder().setCustomId('ticket_unclaim').setLabel('Unclaim').setStyle(ButtonStyle.Secondary).setEmoji('🚪'),
          new ButtonBuilder().setCustomId('ticket_hide').setLabel('Hide').setStyle(ButtonStyle.Primary).setEmoji('🙈')
        );

        const row2 = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('ticket_add_member').setLabel('Add Member').setStyle(ButtonStyle.Secondary).setEmoji('➕'),
          new ButtonBuilder().setCustomId('ticket_remove_member').setLabel('Remove Member').setStyle(ButtonStyle.Secondary).setEmoji('➖')
        );

        await ticketChan.send({ embeds: [controlEmbed], components: [row1, row2] }).catch(console.error);
        await interaction.reply({ content: `Ticket opened: ${ticketChan}`, ephemeral: true }).catch(() => {});
      }
    }

    if (interaction.customId === 'ticket_add_member') {
      const modal = new ModalBuilder().setCustomId('modal_add_member').setTitle('Add Member to Ticket');
      const input = new TextInputBuilder().setCustomId('member_id').setLabel('Member Discord User ID').setStyle(TextInputStyle.Short).setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return interaction.showModal(modal);
    }

    if (interaction.customId === 'ticket_remove_member') {
      const modal = new ModalBuilder().setCustomId('modal_remove_member').setTitle('Remove Member from Ticket');
      const input = new TextInputBuilder().setCustomId('member_id').setLabel('Member Discord User ID').setStyle(TextInputStyle.Short).setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return interaction.showModal(modal);
    }

    if (interaction.customId.startsWith('ticket_')) {
      const isOwnerOrAdmin = interaction.user.id === interaction.guild.ownerId || interaction.member.roles.cache.has(db.config.ownerRoleId) || interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);

      if (interaction.customId === 'ticket_close') {
        if (!isOwnerOrAdmin) return interaction.reply({ content: '❌ Only Server Owners/Admins can close tickets.', ephemeral: true });
        await interaction.reply('🔒 Generating transcript and closing ticket in 5 seconds...');
        await sendTranscript(interaction.channel, 'Ticket');
        setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
      }

      if (interaction.customId === 'ticket_hide') {
        if (!isOwnerOrAdmin) return interaction.reply({ content: '❌ Only Server Owners/Admins can hide tickets.', ephemeral: true });
        if (db.config.staffRoleId) await interaction.channel.permissionOverwrites.edit(db.config.staffRoleId, { ViewChannel: false }).catch(console.error);
        await interaction.reply({ content: '🙈 Ticket hidden! Non-admin staff can no longer view this channel.', ephemeral: true });
      }

      if (interaction.customId === 'ticket_claim') {
        if (!isOwnerOrAdmin) return interaction.reply({ content: '❌ Only Server Owners/Admins can claim tickets.', ephemeral: true });
        await interaction.reply(`🙋 Ticket claimed by <@${interaction.user.id}>!`);
      }

      if (interaction.customId === 'ticket_unclaim') {
        if (!isOwnerOrAdmin) return interaction.reply({ content: '❌ Only Server Owners/Admins can unclaim tickets.', ephemeral: true });
        await interaction.reply(`🚪 Ticket unclaimed by <@${interaction.user.id}>.`);
      }
    }
  }

  // MODAL SUBMISSIONS FOR TICKET ACCESS
  if (interaction.isModalSubmit()) {
    if (interaction.customId === 'modal_add_member') {
      const memberId = interaction.fields.getTextInputValue('member_id');
      await interaction.channel.permissionOverwrites.edit(memberId, { ViewChannel: true, SendMessages: true }).catch(() => {});
      return interaction.reply({ content: `✅ Added <@${memberId}> to the ticket.`, ephemeral: true });
    }

    if (interaction.customId === 'modal_remove_member') {
      const memberId = interaction.fields.getTextInputValue('member_id');
      await interaction.channel.permissionOverwrites.edit(memberId, { ViewChannel: false }).catch(() => {});
      return interaction.reply({ content: `⛔ Removed <@${memberId}> from the ticket.`, ephemeral: true });
    }
  }
});

// ==========================================
// 8. LOGIN
// ==========================================
if (!process.env.DISCORD_TOKEN) {
  console.error('DISCORD_TOKEN env variable missing!');
  process.exit(1);
}

client.login(process.env.DISCORD_TOKEN);
