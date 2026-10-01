const { 
  Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, 
  ButtonBuilder, ButtonStyle, PermissionsBitField, ChannelType, PermissionFlagsBits 
} = require('discord.js');
const express = require('express');
const fs = require('fs');
const path = require('path');

// ==========================================
// 0. GLOBAL CRASH SHIELD (PREVENTS SILENT CRASHES)
// ==========================================
process.on('unhandledRejection', (reason, promise) => {
  console.error('[Unhandled Rejection]:', reason);
});

process.on('uncaughtException', (err, origin) => {
  console.error('[Uncaught Exception]:', err, origin);
});

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
    prefixes: [',', '?', '!'],
    quoteChannelId: '',
    clipsChannelId: '',
    backupChannelId: '1555358918463594646', // Hardcoded backup channel
    staffRoleId: '',
    logChannelId: '',
    autoRoleId: '',
    topChatterRoleId: '',
    verifiedRoleId: '',
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
    // Ensure critical defaults exist if loaded from existing database file
    if (!db.config) db.config = {};
    if (!db.config.prefixes) db.config.prefixes = [',', '?', '!'];
    if (!db.config.prefixes.includes('!')) db.config.prefixes.push('!');
    if (!db.config.backupChannelId) db.config.backupChannelId = '1555358918463594646';
    console.log('Persistent database loaded successfully.');
  } catch (err) {
    console.error('Error reading database file, initializing fresh database:', err);
  }
}

function saveDB() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
  } catch (e) {
    console.error('Error saving DB:', e);
  }
}

const deletedMessages = new Map();
let globalMessageCounter = 0;
let minigameActive = false;
let currentMinigameAnswer = null;

client.once('ready', () => {
  console.log(`[SYSTEM READY] Logged in as ${client.user.tag}`);
  setInterval(updateLeaderboardEmbed, 300000);

  // ------------------------------------------
  // AUTOMATED 15-MINUTE DATABASE BACKUP
  // ------------------------------------------
  setInterval(async () => {
    if (!db.config.backupChannelId) return;

    try {
      const backupChannel = await client.channels.fetch(db.config.backupChannelId).catch(() => null);
      if (!backupChannel) return;

      if (fs.existsSync(DB_FILE)) {
        await backupChannel.send({
          content: '📦 **Automated 15-Minute Database Backup**\nDownload this file and copy its contents into `database.json` on GitHub before redeploying on Render.',
          files: [{ attachment: DB_FILE, name: 'database.json' }]
        });
        console.log('[AUTO-BACKUP] Database backup sent to Discord.');
      }
    } catch (err) {
      console.error('[AUTO-BACKUP ERROR]:', err);
    }
  }, 900000); // 15 minutes = 900,000 ms
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
    }).catch(console.error);

    if (createdChannel) {
      await newState.setChannel(createdChannel).catch(console.error);

      const menuEmbed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle('🎙️ Voice Channel Control Panel')
        .setDescription('Use the buttons below to customize your voice room.');

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('vc_lock').setLabel('🔒 Lock').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('vc_unlock').setLabel('🔓 Unlock').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('vc_hide').setLabel('👁️ Hide').setStyle(ButtonStyle.Danger)
      );

      await createdChannel.send({ embeds: [menuEmbed], components: [row] }).catch(console.error);
    }
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

  // Clips Channel Auto-Reaction
  if (db.config.clipsChannelId && message.channel.id === db.config.clipsChannelId) {
    if (message.attachments.size > 0 || message.content.includes('http')) {
      await message.react('👍').catch(() => {});
      await message.react('👎').catch(() => {});
    }
  }

  // Sticky Message System
  if (db.stickyMessages[message.channel.id]) {
    const stickyText = db.stickyMessages[message.channel.id];
    const msgs = await message.channel.messages.fetch({ limit: 10 }).catch(() => null);
    if (msgs) {
      const lastBotMsg = msgs.find(m => m.author.id === client.user.id && m.content.includes('📌 **Sticky Note:**'));
      if (lastBotMsg) await lastBotMsg.delete().catch(() => {});
    }
    await message.channel.send(`📌 **Sticky Note:**\n${stickyText}`).catch(() => {});
  }

  // AFK Handler
  if (db.afkUsers[message.author.id]) {
    delete db.afkUsers[message.author.id];
    saveDB();
    message.reply('Welcome back! Your AFK status has been removed.').then(m => setTimeout(() => m.delete().catch(() => {}), 4000)).catch(() => {});
  }

  if (message.mentions.users.size > 0) {
    message.mentions.users.forEach(u => {
      if (db.afkUsers[u.id]) {
        message.reply(`**${u.username}** is currently AFK: *${db.afkUsers[u.id]}*`).catch(() => {});
      }
    });
  }

  // Activity Coin System
  globalMessageCounter++;

  if (globalMessageCounter % 100 === 0) {
    const current = db.userCoins[message.author.id] || 0;
    db.userCoins[message.author.id] = current + 10;
    saveDB();
    message.channel.send(`🎉 **100 Messages Hit!** <@${message.author.id}> earned **10 coins**!`).catch(() => {});
  }

  // Math Minigame Spawn
  if (globalMessageCounter % 40 === 0 && !minigameActive) {
    minigameActive = true;
    const n1 = Math.floor(Math.random() * 30) + 1;
    const n2 = Math.floor(Math.random() * 30) + 1;
    currentMinigameAnswer = (n1 + n2).toString();

    const minigameMsg = await message.channel.send(`⚡ **TRIVIA:** What is **${n1} +${n2}**? Type the answer first to win **15 coins**! *(Self-destructs in 45s)*`).catch(() => {});

    setTimeout(async () => {
      if (minigameActive) {
        minigameActive = false;
        currentMinigameAnswer = null;
        if (minigameMsg) await minigameMsg.delete().catch(() => {});
      }
    }, 45000);
  }

  if (minigameActive && message.content.trim() === currentMinigameAnswer) {
    minigameActive = false;
    currentMinigameAnswer = null;
    db.userCoins[message.author.id] = (db.userCoins[message.author.id] || 0) + 15;
    saveDB();
    message.reply('🎉 Correct! You won **15 coins**!').catch(() => {});
  }

  // Command Prefix Resolution
  const usedPrefix = db.config.prefixes.find(p => message.content.startsWith(p));
  if (!usedPrefix) return;

  const args = message.content.slice(usedPrefix.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  // ------------------------------------------
  // PING & SYSTEM STATUS
  // ------------------------------------------
  if (command === 'ping') {
    const sent = await message.reply('🏓 Pinging...').catch(err => {
      console.error('Failed to send ping reply:', err);
    });
    if (!sent) return;

    const latency = sent.createdTimestamp - message.createdTimestamp;
    const apiLatency = Math.round(client.ws.ping);

    return sent.edit(`🏓 **Pong!**\nLatency: \`${latency}ms\` | API Latency: \`${apiLatency}ms\``).catch(console.error);
  }

  // ------------------------------------------
  // MANUAL BACKUP COMMAND
  // ------------------------------------------
  if (command === 'backup') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) return;

    if (!fs.existsSync(DB_FILE)) {
      return message.reply('❌ Database file does not exist yet.');
    }

    return message.channel.send({
      content: '📦 Here is your current `database.json` backup! Download this and paste its contents into GitHub.',
      files: [{ attachment: DB_FILE, name: 'database.json' }]
    }).catch(console.error);
  }

  // ------------------------------------------
  // HELP & ALL COMMANDS LIST
  // ------------------------------------------
  if (command === 'help' || command === 'commands') {
    const helpEmbed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle('📜 Bot Command Center')
      .setDescription(`Current Prefixes: \`${db.config.prefixes.join('`, `')}\``)
      .addFields(
        { name: '⚡ System', value: `\`${usedPrefix}ping\`\n\`${usedPrefix}backup\`` },
        { name: '🎮 Gaming & Ranks', value: `\`${usedPrefix}setrank <game> <rank>\`\n\`${usedPrefix}rank [@user]\`\n\`${usedPrefix}removerank <game>\`` },
        { name: '🛡️ Selfie & Rank Verification', value: `\`${usedPrefix}verify @user\` *(Selfie Verification)*\n\`${usedPrefix}verifyrank @user <game>\` *(Game Rank)*\n\`${usedPrefix}unverifyrank @user <game>\`` },
        { name: '💬 Chat Tools & Fun', value: `\`${usedPrefix}afk [reason]\`\n\`${usedPrefix}snipe\`\n\`${usedPrefix}coins [@user]\`\n\`${usedPrefix}quote [message]\`` },
        { name: '🛠️ Staff Moderation', value: `\`${usedPrefix}warn @user <reason>\`\n\`${usedPrefix}warnings [@user]\`\n\`${usedPrefix}sticky <text>\`\n\`${usedPrefix}unsticky\`` },
        { name: '⚙️ Admin Setup', value: `\`${usedPrefix}sendticketpanel\`\n\`${usedPrefix}sendselfiepanel\`\n\`${usedPrefix}config <setting> <value>\`` }
      );

    return message.channel.send({ embeds: [helpEmbed] }).catch(() => {});
  }

  // ------------------------------------------
  // GAME RANK COMMAND (,setrank / ,rankset)
  // ------------------------------------------
  if (command === 'setrank' || command === 'rankset') {
    const game = args[0]?.toLowerCase();
    const rank = args.slice(1).join(' ');

    if (!game || !rank) return message.reply(`Usage: \`${usedPrefix}setrank <game> <rank>\``);

    const topTierRanks = [
      'predator', 'apex predator', 'radiant', 'top 500', 'grandmaster', 
      'champion', 'supersonic legend', 'ssl', 'iridescent', 'top 250', 
      'ruby', 'diamond 1', 'emerald 1', 'unreal', 'godlike', 'challenger', 
      'immortal', 'heroic', 'legendary'
    ];

    const isHighRank = topTierRanks.some(highRank => rank.toLowerCase().includes(highRank));

    if (!db.userRanks[message.author.id]) db.userRanks[message.author.id] = {};

    if (isHighRank) {
      db.userRanks[message.author.id][game] = { rank, verified: false };
      saveDB();

      if (db.config.logChannelId) {
        const logChan = message.guild.channels.cache.get(db.config.logChannelId);
        if (logChan) {
          const verifyEmbed = new EmbedBuilder()
            .setColor('#FEE75C')
            .setTitle('🛡️ Top Rank Verification Required')
            .setDescription(`User: <@${message.author.id}>\nGame: **${game.toUpperCase()}**\nClaimed Rank: **${rank}**`)
            .setFooter({ text: `User ID: ${message.author.id}` });

          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`verify_approve_${message.author.id}_${game}`).setLabel('Approve').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`verify_deny_${message.author.id}_${game}`).setLabel('Deny').setStyle(ButtonStyle.Danger)
          );

          logChan.send({ embeds: [verifyEmbed], components: [row] }).catch(() => {});
        }
      }

      return message.reply(`Your **${game.toUpperCase()}** rank (**${rank}**) is a top tier and has been sent to staff for verification!`);
    } else {
      db.userRanks[message.author.id][game] = { rank, verified: true };
      saveDB();
      return message.reply(`✅ Your **${game.toUpperCase()}** rank has been set to **${rank}**!`);
    }
  }

  // ------------------------------------------
  // SELFIE VERIFY COMMAND (,verify)
  // ------------------------------------------
  if (command === 'verify') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
      return message.reply('❌ You do not have permission to verify members.');
    }

    const targetMember = message.mentions.members.first();

    if (!targetMember) {
      return message.reply(`Usage: \`${usedPrefix}verify @user\``);
    }

    if (db.config.verifiedRoleId) {
      const verifiedRole = message.guild.roles.cache.get(db.config.verifiedRoleId);
      if (verifiedRole) {
        await targetMember.roles.add(verifiedRole).catch(console.error);
        return message.reply(`📸 Successfully verified **${targetMember.user.tag}** and added the **${verifiedRole.name}** role!`);
      } else {
        return message.reply(`⚠️ Verified role is configured as \`${db.config.verifiedRoleId}\`, but it was not found in this server.`);
      }
    } else {
      return message.reply(`⚠️ Verified role ID is not set. Use \`${usedPrefix}config verifiedRoleId <roleID>\` to configure it.`);
    }
  }

  // ------------------------------------------
  // GAME RANK VERIFY COMMANDS (,verifyrank / ,unverifyrank)
  // ------------------------------------------
  if (command === 'verifyrank') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
      return message.reply('❌ You do not have permission to verify game ranks.');
    }

    const target = message.mentions.users.first();
    const game = args[1]?.toLowerCase();

    if (!target || !game) {
      return message.reply(`Usage: \`${usedPrefix}verifyrank @user <game>\``);
    }

    if (!db.userRanks[target.id]?.[game]) {
      return message.reply(`**${target.username}** has no recorded rank for **${game.toUpperCase()}**.`);
    }

    db.userRanks[target.id][game].verified = true;
    saveDB();

    return message.reply(`🎮 Successfully verified **${target.username}**'s rank for **${game.toUpperCase()}**!`);
  }

  if (command === 'unverifyrank') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
      return message.reply('❌ You do not have permission to unverify game ranks.');
    }

    const target = message.mentions.users.first();
    const game = args[1]?.toLowerCase();

    if (!target || !game) {
      return message.reply(`Usage: \`${usedPrefix}unverifyrank @user <game>\``);
    }

    if (!db.userRanks[target.id]?.[game]) {
      return message.reply(`**${target.username}** has no recorded rank for **${game.toUpperCase()}**.`);
    }

    db.userRanks[target.id][game].verified = false;
    saveDB();

    return message.reply(`⚠️ Unverified **${target.username}**'s rank for **${game.toUpperCase()}**.`);
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

  // ------------------------------------------
  // AFK & CHAT TOOLS (,afk / ,snipe / ,coins)
  // ------------------------------------------
  if (command === 'afk') {
    const reason = args.join(' ') || 'AFK';
    db.afkUsers[message.author.id] = reason;
    saveDB();
    return message.reply(`I set your AFK: **${reason}**`);
  }

  if (command === 'snipe') {
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

  if (command === 'coins' || command === 'bal') {
    const target = message.mentions.users.first() || message.author;
    const coins = db.userCoins[target.id] || 0;
    return message.reply(`🪙 **${target.username}** has **${coins}** coins.`);
  }

  if (command === 'quote') {
    const quoteMsg = args.join(' ');
    if (!quoteMsg) return message.reply(`Usage: \`${usedPrefix}quote <text or quote>\``);

    if (db.config.quoteChannelId) {
      const qChan = message.guild.channels.cache.get(db.config.quoteChannelId);
      if (qChan) {
        const qEmbed = new EmbedBuilder()
          .setColor('#FEE75C')
          .setTitle('💬 Server Quote')
          .setDescription(`"${quoteMsg}"`)
          .setFooter({ text: `Submitted by ${message.author.tag}` });
        
        qChan.send({ embeds: [qEmbed] });
        return message.reply('Quote posted successfully!');
      }
    }
    return message.reply('Quote channel is not configured. Use `,config quoteChannelId <ID>`');
  }

  // ------------------------------------------
  // STICKY MESSAGES (,sticky / ,unsticky)
  // ------------------------------------------
  if (command === 'sticky') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) return;
    const stickyText = args.join(' ');
    if (!stickyText) return message.reply(`Usage: \`${usedPrefix}sticky <message text>\``);

    db.stickyMessages[message.channel.id] = stickyText;
    saveDB();
    return message.channel.send(`📌 **Sticky Note Set:**\n${stickyText}`);
  }

  if (command === 'unsticky') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) return;
    delete db.stickyMessages[message.channel.id];
    saveDB();
    return message.reply('Removed sticky message from this channel.');
  }

  // ------------------------------------------
  // ADMIN SETUP (,sendticketpanel / ,sendselfiepanel / ,config / ,warn)
  // ------------------------------------------
  if (command === 'sendticketpanel') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) return;

    const panelEmbed = new EmbedBuilder()
      .setColor('#57F287')
      .setTitle('🎟 Support Ticket Center')
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
    }).catch(console.error);

    if (ticketChan) {
      if (db.config.staffRoleId) {
        ticketChan.send(`<@&${db.config.staffRoleId}> New ticket created by <@${user.id}>!`).catch(() => {});
      }

      ticketChan.send(`Hello <@${user.id}>! Staff will be with you shortly. This ticket automatically closes after 48 hours of inactivity.`).catch(() => {});
      await interaction.reply({ content: `Ticket created: ${ticketChan}`, ephemeral: true }).catch(() => {});

      setTimeout(() => {
        ticketChan.delete().catch(() => {});
      }, 172800000);
    }
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
        await interaction.update({ content: `✅ Rank approved for <@${targetId}> on **${game}**!`, components: [] }).catch(() => {});
      } else {
        delete db.userRanks[targetId][game];
        saveDB();
        await interaction.update({ content: `❌ Rank denied for <@${targetId}> on **${game}**.`, components: [] }).catch(() => {});
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
  console.log('[AUTO-LEADERBOARD] Periodic update executed.');
}

// ==========================================
// 9. LOGIN
// ==========================================
if (!process.env.DISCORD_TOKEN) {
  console.error('DISCORD_TOKEN env variable missing!');
  process.exit(1);
}

client.login(process.env.DISCORD_TOKEN);
