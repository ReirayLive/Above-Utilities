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
    mainChatId: { type: String, default: '' }, // Set via ,config mainChatId <channel_id>
  },
  ticketCounter: { type: Number, default: 0 },
  userRanks: { type: Map, of: Object, default: {} },
  userCoins: { type: Map, of: Number, default: {} },
  warnings: { type: Map, of: Array, default: {} },
  afkUsers: { type: Map, of: Object, default: {} }, // Stores { reason, timestamp }
  stickyMessages: { type: Map, of: String, default: {} },
  customAliases: { type: Map, of: String, default: {} },
});

const BotDB = mongoose.model('BotData', dbSchema);

let dbData = null;

async function getDB(guildId = 'main') {
  if (!dbData) {
    dbData = await BotDB.findOne({ guildId });
    if (!dbData) {
      dbData = await BotDB.create({ guildId });
    }
  }
  return dbData;
}

async function saveDB() {
  if (dbData) {
    await dbData.save().catch(err => console.error('Error saving MongoDB data:', err));
  }
}

if (process.env.MONGODB_URI) {
  mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('Successfully connected to MongoDB Cloud Database!'))
    .catch(err => console.error('MongoDB Connection Error:', err));
} else {
  console.error('MONGODB_URI environment variable is missing!');
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

// Trivia Questions Collection
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
});

// Helper Function: Transcripts Generator
async function sendTranscript(channel, label) {
  const db = await getDB();
  const logChan = channel.guild.channels.cache.get(db.config.transcriptsChannelId);
  if (!logChan) return;

  const messages = await channel.messages.fetch({ limit: 100 }).catch(() => null);
  if (!messages || messages.size === 0) return;

  const sorted = Array.from(messages.values()).reverse();
  let transcriptText = `===========================================\n`;
  transcriptText += `TRANSCRIPT TYPE: ${label.toUpperCase()}\n`;
  transcriptText += `CHANNEL NAME: #${channel.name}\n`;
  transcriptText += `DATE GENERATED: ${new Date().toISOString()}\n`;
  transcriptText += `===========================================\n\n`;

  sorted.forEach(m => {
    transcriptText += `[${m.createdAt.toLocaleString()}] ${m.author.tag}:${m.content}\n`;
  });

  const buffer = Buffer.from(transcriptText, 'utf-8');
  const attachment = new AttachmentBuilder(buffer, { name: `${channel.name}-transcript.txt` });

  await logChan.send({ content: `📜 **${label} Transcript Logged:** \`${channel.name}\``, files: [attachment] }).catch(() => {});
}

// ==========================================
// 4. AUTO-ROLE & MEMBER JOIN HANDLER
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

// ==========================================
// 5. AUTO-VC (JOIN TO CREATE) HANDLER
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

  // Auto-cleanup VC with Transcript Logging
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

  // Clips Channel Enforcement (Deletes messages without clips/embeds)
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

  // Sticky Message System
  if (db.stickyMessages.get(message.channel.id)) {
    const stickyText = db.stickyMessages.get(message.channel.id);
    const msgs = await message.channel.messages.fetch({ limit: 10 }).catch(() => null);
    if (msgs) {
      const lastBotMsg = msgs.find(m => m.author.id === client.user.id && m.content.includes('📌 **Sticky Note:**'));
      if (lastBotMsg) await lastBotMsg.delete().catch(() => {});
    }
    await message.channel.send(`📌 **Sticky Note:**\n${stickyText}`).catch(() => {});
  }

  // AFK Return Check
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

  if (message.mentions.users.size > 0) {
    message.mentions.users.forEach(u => {
      if (db.afkUsers.has(u.id)) {
        const afkData = db.afkUsers.get(u.id);
        message.reply(`**${u.username}** is currently AFK: *${afkData.reason}*`).catch(() => {});
      }
    });
  }

  // Coin System
  globalMessageCounter++;
  if (globalMessageCounter % 100 === 0) {
    const currentCoins = db.userCoins.get(message.author.id) || 0;
    db.userCoins.set(message.author.id, currentCoins + 10);
    await saveDB();
    message.channel.send(`🎉 **100 Messages Hit!** <@${message.author.id}> earned **10 coins**!`).catch(() => {});
  }

  // Trivia (Restricted ONLY to Main Chat)
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

  // Command Parser
  const usedPrefix = db.config.prefixes.find(p => message.content.startsWith(p));
  if (!usedPrefix) return;

  const args = message.content.slice(usedPrefix.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  // VOICE CHANNEL COMMANDS
  if (command === 'permit') {
    if (!message.member.voice.channel || !message.member.voice.channel.name.startsWith('🔊 ')) {
      return message.reply('❌ You must be inside your temporary voice room to use this.');
    }
    const target = message.mentions.members.first();
    if (!target) return message.reply('Usage: `,permit @member`');

    await message.member.voice.channel.permissionOverwrites.edit(target.id, { Connect: true, ViewChannel: true });
    return message.reply(`✅ Permitted <@${target.id}> to join your voice room.`);
  }

  if (command === 'kick') {
    if (!message.member.voice.channel || !message.member.voice.channel.name.startsWith('🔊 ')) {
      return message.reply('❌ You must be inside your temporary voice room to use this.');
    }
    const target = message.mentions.members.first();
    if (!target) return message.reply('Usage: `,kick @member`');

    await message.member.voice.channel.permissionOverwrites.edit(target.id, { Connect: false });
    if (target.voice.channelId === message.member.voice.channel.id) {
      await target.voice.disconnect().catch(() => {});
    }
    return message.reply(`⛔ Kicked and revoked access for <@${target.id}>.`);
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
    const panelEmbed = new EmbedBuilder()
      .setColor('#57F287')
      .setTitle('🎟 Support Ticket Center')
      .setDescription('Click below to open a private support ticket with staff.');

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('open_ticket').setLabel('Create Ticket').setStyle(ButtonStyle.Primary).setEmoji('📩')
    );
    return message.channel.send({ embeds: [panelEmbed], components: [row] });
  }

  if (command === 'setrank' || command === 'rankset') {
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

    if (!profile || Object.keys(profile).length === 0) {
      return message.reply(`**${target.username}** has no saved game ranks.`);
    }

    const rankEmbed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle(`🎮 Game Ranks — ${target.username}`)
      .setThumbnail(target.displayAvatarURL({ dynamic: true }));

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

    if (!key || !(key in db.config)) {
      return message.reply(`Valid keys: \`${Object.keys(db.config.toObject()).join(', ')}\``);
    }

    db.config[key] = val;
    await saveDB();
    message.delete().catch(() => {});
    return message.channel.send(`✅ Setting **${key}** updated to \`${val}\`.`);
  }
});

// ==========================================
// 7. INTERACTION HANDLER (BUTTONS & TICKETS)
// ==========================================
client.on('interactionCreate', async (interaction) => {
  const db = await getDB();

  if (interaction.isButton()) {
    // TICKET CREATION WITH GLOBAL INCREMENTING NUMBERS
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

      if (db.config.ownerRoleId) {
        permissions.push({ id: db.config.ownerRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] });
      }

      if (db.config.staffRoleId) {
        permissions.push({ id: db.config.staffRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] });
      }

      const ticketChan = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: db.config.ticketCategoryId || null,
        permissionOverwrites: permissions,
      }).catch(console.error);

      if (ticketChan) {
        if (db.config.staffRoleId) ticketChan.send(`<@&${db.config.staffRoleId}> New ticket from <@${user.id}>!`).catch(() => {});
        
        const controlEmbed = new EmbedBuilder()
          .setColor('#5865F2')
          .setTitle(`⚙️ Ticket Panel — #${formattedNumber}`)
          .setDescription(`Welcome <@${user.id}>! Staff will be with you shortly.`);

        const row1 = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('ticket_close').setLabel('Close').setStyle(ButtonStyle.Danger).setEmoji('🔒'),
          new ButtonBuilder().setCustomId('ticket_claim').setLabel('Claim').setStyle(ButtonStyle.Success).setEmoji('🙋'),
          new ButtonBuilder().setCustomId('ticket_unclaim').setLabel('Unclaim').setStyle(ButtonStyle.Secondary).setEmoji('🚪'),
          new ButtonBuilder().setCustomId('ticket_hide').setLabel('Hide').setStyle(ButtonStyle.Primary).setEmoji('🙈')
        );

        await ticketChan.send({ embeds: [controlEmbed], components: [row1] }).catch(console.error);
        await interaction.reply({ content: `Ticket opened: ${ticketChan}`, ephemeral: true }).catch(() => {});
      }
    }

    // TICKET ACTIONS & HIDE/UNHIDE TOGGLE
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

        if (db.config.staffRoleId) {
          await interaction.channel.permissionOverwrites.edit(db.config.staffRoleId, { ViewChannel: false }).catch(console.error);
        }

        const updatedRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('ticket_close').setLabel('Close').setStyle(ButtonStyle.Danger).setEmoji('🔒'),
          new ButtonBuilder().setCustomId('ticket_claim').setLabel('Claim').setStyle(ButtonStyle.Success).setEmoji('🙋'),
          new ButtonBuilder().setCustomId('ticket_unclaim').setLabel('Unclaim').setStyle(ButtonStyle.Secondary).setEmoji('🚪'),
          new ButtonBuilder().setCustomId('ticket_unhide').setLabel('Unhide').setStyle(ButtonStyle.Success).setEmoji('👁️')
        );

        await interaction.update({ components: [updatedRow] });
        await interaction.followUp({ content: '🙈 Ticket hidden! Non-admin staff can no longer view this channel.', ephemeral: true });
      }

      if (interaction.customId === 'ticket_unhide') {
        if (!isOwnerOrAdmin) return interaction.reply({ content: '❌ Only Server Owners/Admins can unhide tickets.', ephemeral: true });

        if (db.config.staffRoleId) {
          await interaction.channel.permissionOverwrites.edit(db.config.staffRoleId, { ViewChannel: true }).catch(console.error);
        }

        const updatedRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('ticket_close').setLabel('Close').setStyle(ButtonStyle.Danger).setEmoji('🔒'),
          new ButtonBuilder().setCustomId('ticket_claim').setLabel('Claim').setStyle(ButtonStyle.Success).setEmoji('🙋'),
          new ButtonBuilder().setCustomId('ticket_unclaim').setLabel('Unclaim').setStyle(ButtonStyle.Secondary).setEmoji('🚪'),
          new ButtonBuilder().setCustomId('ticket_hide').setLabel('Hide').setStyle(ButtonStyle.Primary).setEmoji('🙈')
        );

        await interaction.update({ components: [updatedRow] });
        await interaction.followUp({ content: '👁️ Ticket unhidden! Staff can view this channel again.', ephemeral: true });
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
});

// ==========================================
// 8. LOGGING & LOGIN
// ==========================================
async function logPunishment(guild, title, desc) {
  const db = await getDB();
  if (!db.config.punishmentLogChannelId) return;
  const chan = guild.channels.cache.get(db.config.punishmentLogChannelId);
  if (!chan) return;

  const embed = new EmbedBuilder().setColor('#ED4245').setTitle(title).setDescription(desc).setTimestamp();
  chan.send({ embeds: [embed] }).catch(() => {});
}

if (!process.env.DISCORD_TOKEN) {
  console.error('DISCORD_TOKEN env variable missing!');
  process.exit(1);
}

client.login(process.env.DISCORD_TOKEN);
