const { 
  Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, 
  ButtonBuilder, ButtonStyle, PermissionsBitField, ChannelType, PermissionFlagsBits 
} = require('discord.js');
const express = require('express');
const fs = require('fs');
const path = require('path');

// ==========================================
// 1. EXPRESS KEEP-ALIVE WEB SERVER
// ==========================================
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Bot Online 24/7'));
app.listen(PORT, () => console.log(`Web server listening on port ${PORT}`));

// ==========================================
// 2. DISCORD CLIENT CONFIGURATION
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

// ==========================================
// 3. PERSISTENT JSON DATABASE SYSTEM
// ==========================================
const DB_FILE = path.join(__dirname, 'database.json');

let db = {
  config: {
    prefixes: [',', '?'],
    quoteChannelId: '',
    clipsChannelId: '',
    staffRoleId: '',
    logChannelId: '',
    autoRoleId: '',
    topChatterRoleId: '',
    joinToCreateVcId: '',
  },
  userRanks: {},      
  userCoins: {},      
  warnings: {},       
  afkUsers: {},       
  stickyMessages: {}, 
  customAliases: {},  
};

if (fs.existsSync(DB_FILE)) {
  try {
    db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    console.log('Persistent database loaded successfully.');
  } catch (err) {
    console.error('Error reading database file, initializing fresh database:', err);
  }
}

function saveDB() {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

const deletedMessages = new Map();
let globalMessageCounter = 0;
let minigameActive = false;
let currentMinigameAnswer = null;

client.once('ready', () => {
  console.log(`[SYSTEM READY] Logged in as ${client.user.tag}`);
  setInterval(updateLeaderboardEmbed, 300000);
});

// ==========================================
// 4. AUTO-ROLE & MEMBER JOIN HANDLER
// ==========================================
client.on('guildMemberAdd', async (member) => {
  member.send(`Welcome to **${member.guild.name}**! Check out the rules and enjoy your stay.`).catch(() => {});

  if (db.config.autoRoleId) {
    const role = member.guild.roles.cache.get(db.config.autoRoleId);
    if (role) member.roles.add(role).catch(console.error);
  }

  logAction(member.guild, '📥 Member Joined', `User: <@${member.id}> (${member.user.tag})`);
});

client.on('guildMemberUpdate', async (oldMember, newMember) => {
  const addedRoles = newMember.roles.cache.filter(role => !oldMember.roles.cache.has(role.id));
  if (addedRoles.size > 0) {
    addedRoles.forEach(role => {
      newMember.send(`You have been granted the role **${role.name}** in **${newMember.guild.name}**!`).catch(() => {});
    });
  }
});

// ==========================================
// 5. AUTO-VC & JOIN TO CREATE HANDLER
// ==========================================
client.on('voiceStateUpdate', async (oldState, newState) => {
  if (newState.channelId && newState.channelId === db.config.joinToCreateVcId) {
    const guild = newState.guild;
    const user = newState.member.user;

    const createdChannel = await guild.channels.create({
      name: `🔊 ${user.username}'s Room`,
      type: ChannelType.GuildVoice,
      parent: newState.channel.parentId,
      permissionOverwrites: [
        { id: user.id, allow: [PermissionFlagsBits.ManageChannels, PermissionFlagsBits.MoveMembers] },
      ],
    });

    await newState.setChannel(createdChannel);

    const menuEmbed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle('🎙️ Voice Channel Control Panel')
      .setDescription('Use the buttons below to customize your voice room.');

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('vc_lock').setLabel('🔒 Lock').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('vc_unlock').setLabel('🔓 Unlock').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('vc_hide').setLabel('👁️ Hide').setStyle(ButtonStyle.Danger)
    );

    await createdChannel.send({ embeds: [menuEmbed], components: [row] });
  }

  if (oldState.channel && oldState.channel.name.startsWith('🔊 ') && oldState.channel.members.size === 0) {
    await oldState.channel.delete().catch(() => {});
  }
});

// ==========================================
// 6. MESSAGE TRACKER, AUTOMOD, & COMMANDS
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

  if (db.config.clipsChannelId && message.channel.id === db.config.clipsChannelId) {
    if (message.attachments.size > 0 || message.content.includes('http')) {
      await message.react('👍');
      await message.react('👎');
    }
  }

  if (db.stickyMessages[message.channel.id]) {
    const stickyText = db.stickyMessages[message.channel.id];
    const msgs = await message.channel.messages.fetch({ limit: 10 });
    const lastBotMsg = msgs.find(m => m.author.id === client.user.id && m.content.includes('📌 **Sticky Note:**'));
    if (lastBotMsg) await lastBotMsg.delete().catch(() => {});

    await message.channel.send(`📌 **Sticky Note:**\n${stickyText}`);
  }

  if (db.afkUsers[message.author.id]) {
    delete db.afkUsers[message.author.id];
    saveDB();
    message.reply('Welcome back! Your AFK status has been removed.').then(m => setTimeout(() => m.delete().catch(() => {}), 4000));
  }

  if (message.mentions.users.size > 0) {
    message.mentions.users.forEach(u => {
      if (db.afkUsers[u.id]) {
        message.reply(`**${u.username}** is currently AFK: *${db.afkUsers[u.id]}*`);
      }
    });
  }

  globalMessageCounter++;

  if (globalMessageCounter % 100 === 0) {
    const current = db.userCoins[message.author.id] || 0;
    db.userCoins[message.author.id] = current + 10;
    saveDB();
    message.channel.send(`🎉 **100 Messages Hit!** <@${message.author.id}> earned **10 coins**!`);
  }

  if (globalMessageCounter % 40 === 0 && !minigameActive) {
    minigameActive = true;
    const n1 = Math.floor(Math.random() * 30) + 1;
    const n2 = Math.floor(Math.random() * 30) + 1;
    currentMinigameAnswer = (n1 + n2).toString();

    const minigameMsg = await message.channel.send(`⚡ **TRIVIA:** What is **${n1} +${n2}**? Type the answer first to win **15 coins**! *(Self-destructs in 45s)*`);

    setTimeout(async () => {
      if (minigameActive) {
        minigameActive = false;
        currentMinigameAnswer = null;
        await minigameMsg.delete().catch(() => {});
      }
    }, 45000);
  }

  if (minigameActive && message.content.trim() === currentMinigameAnswer) {
    minigameActive = false;
    currentMinigameAnswer = null;
    db.userCoins[message.author.id] = (db.userCoins[message.author.id] || 0) + 15;
    saveDB();
    message.reply('🎉 Correct! You won **15 coins**!');
  }

  const usedPrefix = db.config.prefixes.find(p => message.content.startsWith(p));
  if (!usedPrefix) return;

  const args = message.content.slice(usedPrefix.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  if (command === 'setrank') {
    const game = args[0]?.toLowerCase();
    const rank = args.slice(1).join(' ');

    if (!game || !rank) return message.reply(`Usage: \`${usedPrefix}setrank <game> <rank>\``);

    if (!db.userRanks[message.author.id]) db.userRanks[message.author.id] = {};
    db.userRanks[message.author.id][game] = { rank, verified: false };
    saveDB();

    if (db.config.logChannelId) {
      const logChan = message.guild.channels.cache.get(db.config.logChannelId);
      if (logChan) {
        const verifyEmbed = new EmbedBuilder()
          .setColor('#FEE75C')
          .setTitle('🛡️ Rank Verification Pending')
          .setDescription(`User: <@${message.author.id}>\nGame: **${game.toUpperCase()}**\nClaimed Rank: **${rank}**`)
          .setFooter({ text: `User ID: ${message.author.id}` });

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`verify_approve_${message.author.id}_${game}`).setLabel('Approve').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`verify_deny_${message.author.id}_${game}`).setLabel('Deny').setStyle(ButtonStyle.Danger)
        );

        logChan.send({ embeds: [verifyEmbed], components: [row] });
      }
    }

    return message.reply(`Your **${game.toUpperCase()}** rank request (**${rank}**) has been sent to staff for verification!`);
  }

  if (command === 'removerank') {
    const game = args[0]?.toLowerCase();
    if (!game || !db.userRanks[message.author.id]?.[game]) {
      return message.reply(`You do not have a set rank for **${game}**.`);
    }

    delete db.userRanks[message.author.id][game];
    saveDB();
    return message.reply(`Removed **${game.toUpperCase()}** from your rank profile.`);
  }

  if (command === 'rank') {
    const target = message.mentions.users.first() || message.author;
    const profile = db.userRanks[target.id];

    if (!profile || Object.keys(profile).length === 0) {
      return message.reply(`**${target.username}** has no verified game ranks.`);
    }

    const rankEmbed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle(`🎮 Verified Game Ranks — ${target.username}`)
      .setThumbnail(target.displayAvatarURL({ dynamic: true }));

    let count = 0;
    for (const [game, data] of Object.entries(profile)) {
      if (data.verified) {
        rankEmbed.addFields({ name: game.toUpperCase(), value: `\`${data.rank}\` ✅`, inline: true });
        count++;
      }
    }

    if (count === 0) return message.reply(`**${target.username}** has no verified ranks approved yet.`);
    return message.channel.send({ embeds: [rankEmbed] });
  }

  if (command === 'sendticketpanel') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) return;

    const panelEmbed = new EmbedBuilder()
      .setColor('#57F287')
      .setTitle('🎟️ Support Ticket Center')
      .setDescription('Need help or want to speak with staff? Click the button below to open a ticket.');

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('open_ticket').setLabel('Create Ticket').setStyle(ButtonStyle.Primary).setEmoji('📩')
    );

    return message.channel.send({ embeds: [panelEmbed], components: [row] });
  }

  if (command === 'sendselfiepanel') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) return;

    const selfieEmbed = new EmbedBuilder()
      .setColor('#EB459E')
      .setTitle('🤳 Selfie Verification')
      .setDescription('Click below to submit your selfie verification for access to verified channels.');

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('open_selfie_verify').setLabel('Verify Identity').setStyle(ButtonStyle.Success)
    );

    return message.channel.send({ embeds: [selfieEmbed], components: [row] });
  }

  if (command === 'warn') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return;
    const target = message.mentions.members.first();
    const reason = args.slice(1).join(' ') || 'No reason provided';
    if (!target) return message.reply('Please mention a user to warn.');

    if (!db.warnings[target.id]) db.warnings[target.id] = [];
    db.warnings[target.id].push({ reason, staff: message.author.tag, date: new Date().toISOString() });
    saveDB();

    target.send(`⚠️ You received a warning in **${message.guild.name}**\n**Reason:** ${reason}`).catch(() => {});
    return message.channel.send(`Warned **${target.user.tag}**. Total warnings: **${db.warnings[target.id].length}**`);
  }

  if (command === 'warnings') {
    const target = message.mentions.users.first() || message.author;
    const logs = db.warnings[target.id] || [];

    if (logs.length === 0) return message.reply(`**${target.username}** has no recorded warnings.`);

    const warnEmbed = new EmbedBuilder()
      .setColor('#ED4245')
      .setTitle(`⚠️ Warning Log — ${target.username}`)
      .setDescription(logs.map((w, i) => `**#${i + 1}** - *${w.reason}* (By:${w.staff})`).join('\n'));

    return message.channel.send({ embeds: [warnEmbed] });
  }

  if (command === 'config') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) return;
    const key = args[0];
    const val = args[1];

    if (!key || !(key in db.config)) {
      return message.reply(`Valid config keys: \`${Object.keys(db.config).join(', ')}\``);
    }

    db.config[key] = val;
    saveDB();
    return message.reply(`Updated setting **${key}** to \`${val}\`.`);
  }
});

// ==========================================
// 7. BUTTON INTERACTION HANDLER
// ==========================================
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  if (interaction.customId === 'open_ticket') {
    const guild = interaction.guild;
    const user = interaction.user;
    const chanName = `ticket-${user.username.toLowerCase().replace(/[^a-z0-9]/g, '')}`;

    const ticketChan = await guild.channels.create({
      name: chanName,
      type: ChannelType.GuildText,
      permissionOverwrites: [
        { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
      ],
    });

    if (db.config.staffRoleId) {
      ticketChan.send(`<@&${db.config.staffRoleId}> New ticket created by <@${user.id}>!`);
    }

    ticketChan.send(`Hello <@${user.id}>! Staff will be with you shortly. This ticket automatically closes after 48 hours of inactivity.`);
    await interaction.reply({ content: `Ticket created: ${ticketChan}`, ephemeral: true });

    setTimeout(() => {
      ticketChan.delete().catch(() => {});
    }, 172800000);
  }

  if (interaction.customId.startsWith('verify_')) {
    const parts = interaction.customId.split('_');
    const action = parts[1];
    const targetId = parts[2];
    const game = parts[3];

    if (db.userRanks[targetId]?.[game]) {
      if (action === 'approve') {
        db.userRanks[targetId][game].verified = true;
        saveDB();
        await interaction.update({ content: `✅ Rank approved for <@${targetId}> on **${game}**!`, components: [] });
      } else {
        delete db.userRanks[targetId][game];
        saveDB();
        await interaction.update({ content: `❌ Rank denied for <@${targetId}> on **${game}**.`, components: [] });
      }
    }
  }
});

// ==========================================
// 8. HELPER FUNCTIONS
// ==========================================
function logAction(guild, title, desc) {
  if (!db.config.logChannelId) return;
  const chan = guild.channels.cache.get(db.config.logChannelId);
  if (!chan) return;

  const embed = new EmbedBuilder().setColor('#5865F2').setTitle(title).setDescription(desc).setTimestamp();
  chan.send({ embeds: [embed] }).catch(() => {});
}

function updateLeaderboardEmbed() {
  console.log('[AUTO-LEADERBOARD] 5-minute periodic update check executed.');
}

// ==========================================
// 9. LOGIN
// ==========================================
if (!process.env.DISCORD_TOKEN) {
  console.error('DISCORD_TOKEN env variable missing!');
  process.exit(1);
}

client.login(process.env.DISCORD_TOKEN);
