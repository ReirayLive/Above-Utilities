const { 
  Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, 
  ButtonBuilder, ButtonStyle, PermissionsBitField, ChannelType, PermissionFlagsBits 
} = require('discord.js');
const express = require('express');
const fs = require('fs');
const path = require('path');

// ==========================================
// 0. GLOBAL CRASH SHIELD
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
    quoteChannelId: '1555010046994415697',
    clipsChannelId: '1471595263100584006',
    backupChannelId: '1555358918463594646',
    banRequestChannelId: '1555028208913489990',
    punishmentLogChannelId: '1555364819433951242',
    verificationLogChannelId: '1555365045834092554',
    staffRoleId: '1554712377595920474',
    verifiedRoleId: '1471595261787766995',
    autoRoleId: '1471604983706161334',
    joinToCreateVcId: '1554711771510480926',
  },
  userRanks: {},      
  userCoins: {},      
  warnings: {},       
  afkUsers: {},       
  stickyMessages: {}, 
  customAliases: {},  
};

function saveDB() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
  } catch (e) {
    console.error('Error saving DB:', e);
  }
}

// Load DB & auto-inject hardcoded channel/role IDs
if (fs.existsSync(DB_FILE)) {
  try {
    const loadedData = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    db = { ...db, ...loadedData };
    if (!db.config) db.config = {};
    
    // Ensure all hardcoded default IDs are set if missing from JSON
    db.config.prefixes = db.config.prefixes || [',', '?', '!'];
    db.config.quoteChannelId = db.config.quoteChannelId || '1555010046994415697';
    db.config.clipsChannelId = db.config.clipsChannelId || '1471595263100584006';
    db.config.backupChannelId = db.config.backupChannelId || '1555358918463594646';
    db.config.banRequestChannelId = db.config.banRequestChannelId || '1555028208913489990';
    db.config.punishmentLogChannelId = db.config.punishmentLogChannelId || '1555364819433951242';
    db.config.verificationLogChannelId = db.config.verificationLogChannelId || '1555365045834092554';
    db.config.staffRoleId = db.config.staffRoleId || '1554712377595920474';
    db.config.verifiedRoleId = db.config.verifiedRoleId || '1471595261787766995';
    db.config.autoRoleId = db.config.autoRoleId || '1471604983706161334';
    db.config.joinToCreateVcId = db.config.joinToCreateVcId || '1554711771510480926';

    if (!db.warnings) db.warnings = {};
    saveDB();
    console.log('Persistent database loaded with assigned IDs.');
  } catch (err) {
    console.error('Error reading database file, resetting defaults:', err);
    saveDB();
  }
} else {
  console.log('database.json missing — creating new initial file...');
  saveDB();
}

const deletedMessages = new Map();
let globalMessageCounter = 0;
let minigameActive = false;
let currentMinigameAnswer = null;

client.once('ready', () => {
  console.log(`[SYSTEM READY] Logged in as ${client.user.tag}`);

  // 15-Minute Automated Backup Loop
  setInterval(async () => {
    if (!db.config.backupChannelId) return;
    try {
      const backupChannel = await client.channels.fetch(db.config.backupChannelId).catch(() => null);
      if (!backupChannel) return;

      if (fs.existsSync(DB_FILE)) {
        await backupChannel.send({
          content: '📦 **Automated 15-Minute Database Backup**',
          files: [{ attachment: DB_FILE, name: 'database.json' }]
        });
        console.log('[AUTO-BACKUP] Database backup dispatched.');
      }
    } catch (err) {
      console.error('[AUTO-BACKUP ERROR]:', err);
    }
  }, 900000); 
});

// ==========================================
// 4. AUTO-ROLE & MEMBER JOIN HANDLER
// ==========================================
client.on('guildMemberAdd', async (member) => {
  member.send(`Welcome to **${member.guild.name}**! Enjoy your stay.`).catch(() => {});

  if (db.config.autoRoleId) {
    const role = member.guild.roles.cache.get(db.config.autoRoleId);
    if (role) member.roles.add(role).catch(console.error);
  }

  logPunishment(member.guild, '📥 Member Joined', `User: <@${member.id}> (${member.user.tag})`);
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
// 5. AUTO-VC (JOIN TO CREATE) HANDLER
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
        .setTitle('🎙️ Voice Control Panel')
        .setDescription('Manage your temporary voice channel using the buttons below.');

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

  // Clips Auto-Reaction
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

  // AFK System
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
    db.userCoins[message.author.id] = (db.userCoins[message.author.id] || 0) + 10;
    saveDB();
    message.channel.send(`🎉 **100 Messages Hit!** <@${message.author.id}> earned **10 coins**!`).catch(() => {});
  }

  // Math Minigame Spawn
  if (globalMessageCounter % 40 === 0 && !minigameActive) {
    minigameActive = true;
    const n1 = Math.floor(Math.random() * 30) + 1;
    const n2 = Math.floor(Math.random() * 30) + 1;
    currentMinigameAnswer = (n1 + n2).toString();

    const minigameMsg = await message.channel.send(`⚡ **TRIVIA:** What is **${n1} +${n2}**? Type answer first for **15 coins**! *(45s)*`).catch(() => {});

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

  // SYSTEM COMMANDS
  if (command === 'ping') {
    const sent = await message.reply('🏓 Pinging...').catch(console.error);
    if (!sent) return;
    return sent.edit(`🏓 **Pong!** Latency: \`${sent.createdTimestamp - message.createdTimestamp}ms\` | API: \`${Math.round(client.ws.ping)}ms\``);
  }

  if (command === 'backup') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) return;
    if (!fs.existsSync(DB_FILE)) saveDB();
    return message.channel.send({
      content: '📦 Here is your current `database.json` backup!',
      files: [{ attachment: DB_FILE, name: 'database.json' }]
    }).catch(console.error);
  }

  if (command === 'help' || command === 'commands') {
    const helpEmbed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle('📜 Bot Command Center')
      .setDescription(`Current Prefixes: \`${db.config.prefixes.join('`, `')}\``)
      .addFields(
        { name: '⚡ System', value: `\`${usedPrefix}ping\`\n\`${usedPrefix}backup\`` },
        { name: '🎮 Gaming & Ranks', value: `\`${usedPrefix}setrank <game> <rank>\`\n\`${usedPrefix}rank [@user]\`\n\`${usedPrefix}removerank <game>\`` },
        { name: '🛡️ Moderation', value: `\`${usedPrefix}ban @user [reason]\`\n\`${usedPrefix}banrequest @user [reason]\`\n\`${usedPrefix}timeout @user <min> [reason]\`\n\`${usedPrefix}untimeout @user\`\n\`${usedPrefix}addrole @user <role>\`\n\`${usedPrefix}removerole @user <role>\`` },
        { name: '⚠️ Warning Management', value: `\`${usedPrefix}warn @user [reason]\`\n\`${usedPrefix}warnings [@user]\`\n\`${usedPrefix}removewarning @user <index>\`\n\`${usedPrefix}clearwarnings @user\`` },
        { name: '💬 Chat Tools & Fun', value: `\`${usedPrefix}afk [reason]\`\n\`${usedPrefix}snipe\`\n\`${usedPrefix}coins [@user]\`\n\`${usedPrefix}quote [message]\`\n\`${usedPrefix}sticky <text>\`\n\`${usedPrefix}unsticky\`` },
        { name: '⚙️ Admin Setup', value: `\`${usedPrefix}verify @user\`\n\`${usedPrefix}verifyrank @user <game>\`\n\`${usedPrefix}sendticketpanel\`\n\`${usedPrefix}sendselfiepanel\`\n\`${usedPrefix}config <setting> <value>\`` }
      );

    return message.channel.send({ embeds: [helpEmbed] }).catch(() => {});
  }

  // MODERATION: BAN & BAN REQUEST
  if (command === 'ban') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
      return message.reply('❌ You do not have permission to ban members.');
    }

    const targetMember = message.mentions.members.first();
    const reason = args.slice(1).join(' ') || 'No reason provided';

    if (!targetMember) return message.reply(`Usage: \`${usedPrefix}ban @user [reason]\``);
    if (!targetMember.bannable) return message.reply('❌ I cannot ban this user (they may have higher roles than me).');

    await targetMember.ban({ reason }).catch(err => message.reply(`Failed to ban: ${err.message}`));
    logPunishment(message.guild, '🔨 Member Banned', `User: <@${targetMember.id}>\nModerator: <@${message.author.id}>\nReason:${reason}`);
    return message.channel.send(`🔨 Successfully banned **${targetMember.user.tag}**.`);
  }

  if (command === 'banrequest' || command === 'banreq') {
    const target = message.mentions.users.first();
    const reason = args.slice(1).join(' ') || 'No reason provided';

    if (!target) return message.reply(`Usage: \`${usedPrefix}banrequest @user [reason]\``);

    if (db.config.banRequestChannelId) {
      const banReqChan = message.guild.channels.cache.get(db.config.banRequestChannelId);
      if (banReqChan) {
        const reqEmbed = new EmbedBuilder()
          .setColor('#ED4245')
          .setTitle('🚨 Ban Request Submitted')
          .setDescription(`Target User: <@${target.id}> (${target.tag})\nRequested By: <@${message.author.id}>\nReason: **${reason}**`)
          .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`req_approve_ban_${target.id}`).setLabel('Approve Ban').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId(`req_deny_ban_${target.id}`).setLabel('Deny Request').setStyle(ButtonStyle.Secondary)
        );

        banReqChan.send({ embeds: [reqEmbed], components: [row] }).catch(() => {});
        return message.reply(`✅ Ban request submitted to the ban request log for **${target.tag}**.`);
      }
    }
    return message.reply('⚠️ Ban request channel ID is not configured.');
  }

  // MODERATION: TIMEOUT & UNTIMEOUT
  if (command === 'timeout' || command === 'mute') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
      return message.reply('❌ You do not have permission to timeout members.');
    }

    const targetMember = message.mentions.members.first();
    const durationMins = parseInt(args[1], 10);
    const reason = args.slice(2).join(' ') || 'No reason provided';

    if (!targetMember || isNaN(durationMins)) {
      return message.reply(`Usage: \`${usedPrefix}timeout @user <minutes> [reason]\``);
    }

    await targetMember.timeout(durationMins * 60 * 1000, reason).catch(err => message.reply(`Failed to timeout: ${err.message}`));
    logPunishment(message.guild, '🔇 Member Timed Out', `User: <@${targetMember.id}>\nDuration:${durationMins}m\nModerator: <@${message.author.id}>\nReason:${reason}`);
    return message.channel.send(`🔇 Timed out **${targetMember.user.tag}** for **${durationMins}** minutes.`);
  }

  if (command === 'untimeout' || command === 'unmute') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
      return message.reply('❌ You do not have permission to remove timeouts.');
    }

    const targetMember = message.mentions.members.first();
    if (!targetMember) return message.reply(`Usage: \`${usedPrefix}untimeout @user\``);

    await targetMember.timeout(null).catch(err => message.reply(`Failed to remove timeout: ${err.message}`));
    logPunishment(message.guild, '🔊 Member Timeout Removed', `User: <@${targetMember.id}>\nModerator: <@${message.author.id}`);
    return message.channel.send(`🔊 Removed timeout for **${targetMember.user.tag}**.`);
  }

  // MODERATION: ADD / REMOVE ROLE
  if (command === 'addrole' || command === 'role') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageRoles)) return;
    const targetMember = message.mentions.members.first();
    const roleQuery = args.slice(1).join(' ');
    if (!targetMember || !roleQuery) return message.reply(`Usage: \`${usedPrefix}addrole @user <Role Name or ID>\``);

    const role = message.guild.roles.cache.get(roleQuery.replace(/[<@&>]/g, '')) || 
                 message.guild.roles.cache.find(r => r.name.toLowerCase() === roleQuery.toLowerCase());

    if (!role) return message.reply('❌ Could not find that role.');
    await targetMember.roles.add(role).catch(err => message.reply(`Failed: ${err.message}`));
    return message.channel.send(`✅ Granted **${role.name}** to **${targetMember.user.tag}**.`);
  }

  if (command === 'removerole') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageRoles)) return;
    const targetMember = message.mentions.members.first();
    const roleQuery = args.slice(1).join(' ');
    if (!targetMember || !roleQuery) return message.reply(`Usage: \`${usedPrefix}removerole @user <Role Name or ID>\``);

    const role = message.guild.roles.cache.get(roleQuery.replace(/[<@&>]/g, '')) || 
                 message.guild.roles.cache.find(r => r.name.toLowerCase() === roleQuery.toLowerCase());

    if (!role) return message.reply('❌ Could not find that role.');
    await targetMember.roles.remove(role).catch(err => message.reply(`Failed: ${err.message}`));
    return message.channel.send(`🗑️ Removed **${role.name}** from **${targetMember.user.tag}**.`);
  }

  // WARNING MANAGEMENT
  if (command === 'warn') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return;
    const target = message.mentions.members.first();
    const reason = args.slice(1).join(' ') || 'No reason provided';
    if (!target) return message.reply(`Usage: \`${usedPrefix}warn @user [reason]\``);

    if (!db.warnings[target.id]) db.warnings[target.id] = [];
    db.warnings[target.id].push({ reason, staff: message.author.tag, date: new Date().toISOString() });
    saveDB();

    logPunishment(message.guild, '⚠️ Warning Issued', `User: <@${target.id}>\nModerator: <@${message.author.id}>\nReason:${reason}`);
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

  if (command === 'removewarning' || command === 'delwarn') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return;
    const target = message.mentions.users.first();
    const index = parseInt(args[1], 10) - 1;

    if (!target || isNaN(index) || !db.warnings[target.id]?.[index]) {
      return message.reply(`Usage: \`${usedPrefix}removewarning @user <warning_number>\``);
    }

    const removed = db.warnings[target.id].splice(index, 1);
    saveDB();
    return message.reply(`✅ Removed warning #${index + 1} (*${removed[0].reason}*) from **${target.username}**.`);
  }

  if (command === 'clearwarnings') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return;
    const target = message.mentions.users.first();
    if (!target) return message.reply(`Usage: \`${usedPrefix}clearwarnings @user\``);

    db.warnings[target.id] = [];
    saveDB();
    return message.reply(`🧹 Cleared all warnings for **${target.username}**.`);
  }

  // GAME RANKS
  if (command === 'setrank' || command === 'rankset') {
    const game = args[0]?.toLowerCase();
    const rank = args.slice(1).join(' ');
    if (!game || !rank) return message.reply(`Usage: \`${usedPrefix}setrank <game> <rank>\``);

    const topTierRanks = ['predator', 'radiant', 'grandmaster', 'champion', 'ssl', 'iridescent', 'top 250', 'godlike', 'unreal'];
    const isHighRank = topTierRanks.some(r => rank.toLowerCase().includes(r));

    if (!db.userRanks[message.author.id]) db.userRanks[message.author.id] = {};

    if (isHighRank) {
      db.userRanks[message.author.id][game] = { rank, verified: false };
      saveDB();

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
      return message.reply(`Your **${game.toUpperCase()}** rank (**${rank}**) requires staff approval and was sent to verification logs!`);
    } else {
      db.userRanks[message.author.id][game] = { rank, verified: true };
      saveDB();
      return message.reply(`✅ Your **${game.toUpperCase()}** rank has been saved as **${rank}**!`);
    }
  }

  // MANUAL VERIFY FALLBACK COMMAND
  if (command === 'verify') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return;
    const targetMember = message.mentions.members.first();
    if (!targetMember) return message.reply(`Usage: \`${usedPrefix}verify @user\``);

    if (db.config.verifiedRoleId) {
      const verifiedRole = message.guild.roles.cache.get(db.config.verifiedRoleId);
      if (verifiedRole) {
        await targetMember.roles.add(verifiedRole).catch(console.error);
        return message.reply(`📸 Verified **${targetMember.user.tag}** and added **${verifiedRole.name}**!`);
      }
    }
    return message.reply('⚠️ Verified Role ID not properly configured.');
  }

  if (command === 'rank') {
    const target = message.mentions.users.first() || message.author;
    const profile = db.userRanks[target.id];

    if (!profile || Object.keys(profile).length === 0) {
      return message.reply(`**${target.username}** has no verified game ranks.`);
    }

    const rankEmbed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle(`🎮 Game Ranks — ${target.username}`)
      .setThumbnail(target.displayAvatarURL({ dynamic: true }));

    let count = 0;
    for (const [game, data] of Object.entries(profile)) {
      if (data.verified) {
        rankEmbed.addFields({ name: game.toUpperCase(), value: `\`${data.rank}\` ✅`, inline: true });
        count++;
      }
    }

    if (count === 0) return message.reply(`**${target.username}** has no approved ranks yet.`);
    return message.channel.send({ embeds: [rankEmbed] });
  }

  // CHAT & TOOLS
  if (command === 'afk') {
    const reason = args.join(' ') || 'AFK';
    db.afkUsers[message.author.id] = reason;
    saveDB();
    return message.reply(`Set your AFK: **${reason}**`);
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
    return message.reply(`🪙 **${target.username}** has **${db.userCoins[target.id] || 0}** coins.`);
  }

  if (command === 'quote') {
    const quoteMsg = args.join(' ');
    if (!quoteMsg) return message.reply(`Usage: \`${usedPrefix}quote <text>\``);

    if (db.config.quoteChannelId) {
      const qChan = message.guild.channels.cache.get(db.config.quoteChannelId);
      if (qChan) {
        const qEmbed = new EmbedBuilder()
          .setColor('#FEE75C')
          .setTitle('💬 Server Quote')
          .setDescription(`"${quoteMsg}"`)
          .setFooter({ text: `Submitted by ${message.author.tag}` });
        
        qChan.send({ embeds: [qEmbed] });
        return message.reply('Quote posted!');
      }
    }
  }

  if (command === 'sticky') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) return;
    const stickyText = args.join(' ');
    if (!stickyText) return message.reply(`Usage: \`${usedPrefix}sticky <text>\``);

    db.stickyMessages[message.channel.id] = stickyText;
    saveDB();
    return message.channel.send(`📌 **Sticky Note Set:**\n${stickyText}`);
  }

  if (command === 'unsticky') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) return;
    delete db.stickyMessages[message.channel.id];
    saveDB();
    return message.reply('Removed sticky message.');
  }

  // PANELS & CONFIG
  if (command === 'sendticketpanel') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) return;
    const panelEmbed = new EmbedBuilder()
      .setColor('#57F287')
      .setTitle('🎟 Support Ticket Center')
      .setDescription('Click below to open a private support ticket with staff.');

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('open_ticket').setLabel('Create Ticket').setStyle(ButtonStyle.Primary).setEmoji('📩')
    );
    return message.channel.send({ embeds: [panelEmbed], components: [row] });
  }

  if (command === 'sendselfiepanel') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) return;
    const selfieEmbed = new EmbedBuilder()
      .setColor('#EB459E')
      .setTitle('🤳 Identity Verification')
      .setDescription('Click below to request verification access.');

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('open_selfie_verify').setLabel('Verify Me').setStyle(ButtonStyle.Success).setEmoji('📸')
    );
    return message.channel.send({ embeds: [selfieEmbed], components: [row] });
  }

  if (command === 'config') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) return;
    const key = args[0];
    const val = args[1];

    if (!key || !(key in db.config)) {
      return message.reply(`Valid keys: \`${Object.keys(db.config).join(', ')}\``);
    }

    db.config[key] = val;
    saveDB();
    return message.reply(`✅ Setting **${key}** updated to \`${val}\`.`);
  }
});

// ==========================================
// 7. BUTTON INTERACTION HANDLER
// ==========================================
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  // TICKET BUTTON
  if (interaction.customId === 'open_ticket') {
    const guild = interaction.guild;
    const user = interaction.user;
    const ticketChan = await guild.channels.create({
      name: `ticket-${user.username.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
      type: ChannelType.GuildText,
      permissionOverwrites: [
        { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
      ],
    }).catch(console.error);

    if (ticketChan) {
      if (db.config.staffRoleId) ticketChan.send(`<@&${db.config.staffRoleId}> New ticket from <@${user.id}>!`).catch(() => {});
      ticketChan.send(`Hello <@${user.id}>! Staff will be with you shortly.`).catch(() => {});
      await interaction.reply({ content: `Ticket opened: ${ticketChan}`, ephemeral: true }).catch(() => {});
    }
  }

  // SELFIE VERIFY REQUEST BUTTON
  if (interaction.customId === 'open_selfie_verify') {
    const user = interaction.user;
    const vChan = interaction.guild.channels.cache.get(db.config.verificationLogChannelId);

    if (vChan) {
      const vEmbed = new EmbedBuilder()
        .setColor('#EB459E')
        .setTitle('📸 New Verification Request')
        .setDescription(`Member: <@${user.id}> (${user.tag})\nRequested At: <t:${Math.floor(Date.now() / 1000)}:F>`)
        .setThumbnail(user.displayAvatarURL());

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`selfie_approve_${user.id}`).setLabel('Approve Verification').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`selfie_deny_${user.id}`).setLabel('Deny Request').setStyle(ButtonStyle.Danger)
      );

      vChan.send({ embeds: [vEmbed], components: [row] }).catch(() => {});
      await interaction.reply({ content: '✅ Verification request sent to staff!', ephemeral: true });
    } else {
      await interaction.reply({ content: '❌ Verification channel unavailable.', ephemeral: true });
    }
  }

  // APPROVE / DENY SELFIE VERIFICATION
  if (interaction.customId.startsWith('selfie_')) {
    const parts = interaction.customId.split('_');
    const action = parts[1];
    const targetId = parts[2];

    if (action === 'approve') {
      const member = await interaction.guild.members.fetch(targetId).catch(() => null);
      if (member && db.config.verifiedRoleId) {
        await member.roles.add(db.config.verifiedRoleId).catch(console.error);
        await interaction.update({ content: `✅ Verification approved for <@${targetId}>! Role granted.`, components: [] });
      } else {
        await interaction.update({ content: `❌ Could not find member or role.`, components: [] });
      }
    } else {
      await interaction.update({ content: `❌ Verification request denied for <@${targetId}>.`, components: [] });
    }
  }

  // APPROVE / DENY BAN REQUEST
  if (interaction.customId.startsWith('req_')) {
    const parts = interaction.customId.split('_');
    const action = parts[1];
    const targetId = parts[3];

    if (action === 'approve') {
      const member = await interaction.guild.members.fetch(targetId).catch(() => null);
      if (member) {
        await member.ban({ reason: 'Ban request approved by staff.' }).catch(console.error);
        await interaction.update({ content: `🔨 Ban request approved. <@${targetId}> has been banned.`, components: [] });
      } else {
        await interaction.update({ content: `❌ Target member left or was not found.`, components: [] });
      }
    } else {
      await interaction.update({ content: `❌ Ban request denied for <@${targetId}>.`, components: [] });
    }
  }

  // APPROVE / DENY GAME RANK
  if (interaction.customId.startsWith('verify_rank_')) {
    const parts = interaction.customId.split('_');
    const action = parts[2];
    const targetId = parts[3];
    const game = parts[4];

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
// 8. HELPER LOGGING FUNCTIONS
// ==========================================
function logPunishment(guild, title, desc) {
  if (!db.config.punishmentLogChannelId) return;
  const chan = guild.channels.cache.get(db.config.punishmentLogChannelId);
  if (!chan) return;

  const embed = new EmbedBuilder().setColor('#ED4245').setTitle(title).setDescription(desc).setTimestamp();
  chan.send({ embeds: [embed] }).catch(() => {});
}

// ==========================================
// 9. LOGIN
// ==========================================
if (!process.env.DISCORD_TOKEN) {
  console.error('DISCORD_TOKEN env variable missing!');
  process.exit(1);
}

client.login(process.env.DISCORD_TOKEN);
