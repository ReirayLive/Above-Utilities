const { 
  Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, 
  ButtonBuilder, ButtonStyle, PermissionsBitField, ChannelType, PermissionFlagsBits,
  ModalBuilder, TextInputBuilder, TextInputStyle
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
    staffRoleId: { type: String, default: '1554712377595920474' },
    verifiedRoleId: { type: String, default: '1471595261787766995' },
    autoRoleId: { type: String, default: '1471604983706161334' },
    joinToCreateVcId: { type: String, default: '1554711771510480926' },
  },
  userRanks: { type: Map, of: Object, default: {} },
  userCoins: { type: Map, of: Number, default: {} },
  warnings: { type: Map, of: Array, default: {} },
  afkUsers: { type: Map, of: String, default: {} },
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

// Connect to MongoDB Cloud
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

client.once('ready', async () => {
  console.log(`[SYSTEM READY] Logged in as ${client.user.tag}`);
  await getDB();
});

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
  const db = await getDB();
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
        new ButtonBuilder().setCustomId('vc_hide').setLabel('👁 Hide').setStyle(ButtonStyle.Danger)
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
  const db = await getDB();

  if (db.config.clipsChannelId && message.channel.id === db.config.clipsChannelId) {
    if (message.attachments.size > 0 || message.content.includes('http')) {
      await message.react('👍').catch(() => {});
      await message.react('👎').catch(() => {});
    }
  }

  if (db.stickyMessages.get(message.channel.id)) {
    const stickyText = db.stickyMessages.get(message.channel.id);
    const msgs = await message.channel.messages.fetch({ limit: 10 }).catch(() => null);
    if (msgs) {
      const lastBotMsg = msgs.find(m => m.author.id === client.user.id && m.content.includes('📌 **Sticky Note:**'));
      if (lastBotMsg) await lastBotMsg.delete().catch(() => {});
    }
    await message.channel.send(`📌 **Sticky Note:**\n${stickyText}`).catch(() => {});
  }

  if (db.afkUsers.has(message.author.id)) {
    db.afkUsers.delete(message.author.id);
    await saveDB();
    message.reply('Welcome back! Your AFK status has been removed.').then(m => setTimeout(() => m.delete().catch(() => {}), 4000)).catch(() => {});
  }

  if (message.mentions.users.size > 0) {
    message.mentions.users.forEach(u => {
      if (db.afkUsers.has(u.id)) {
        message.reply(`**${u.username}** is currently AFK: *${db.afkUsers.get(u.id)}*`).catch(() => {});
      }
    });
  }

  globalMessageCounter++;
  if (globalMessageCounter % 100 === 0) {
    const currentCoins = db.userCoins.get(message.author.id) || 0;
    db.userCoins.set(message.author.id, currentCoins + 10);
    await saveDB();
    message.channel.send(`🎉 **100 Messages Hit!** <@${message.author.id}> earned **10 coins**!`).catch(() => {});
  }

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
    const currentCoins = db.userCoins.get(message.author.id) || 0;
    db.userCoins.set(message.author.id, currentCoins + 15);
    await saveDB();
    message.reply('🎉 Correct! You won **15 coins**!').catch(() => {});
  }

  const usedPrefix = db.config.prefixes.find(p => message.content.startsWith(p));
  if (!usedPrefix) return;

  const args = message.content.slice(usedPrefix.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  if (command === 'ping') {
    const sent = await message.reply('🏓 Pinging...').catch(console.error);
    if (!sent) return;
    return sent.edit(`🏓 **Pong!** Latency: \`${sent.createdTimestamp - message.createdTimestamp}ms\` | API: \`${Math.round(client.ws.ping)}ms\``);
  }

  if (command === 'help' || command === 'commands') {
    const helpEmbed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle('📜 Bot Command Center')
      .setDescription(`Current Prefixes: \`${db.config.prefixes.join('`, `')}\``)
      .addFields(
        { name: '⚡ System', value: `\`${usedPrefix}ping\`` },
        { name: '🎮 Gaming & Ranks', value: `\`${usedPrefix}setrank <game> <rank>\`\n\`${usedPrefix}rank [@user]\`` },
        { name: '🛡️ Moderation', value: `\`${usedPrefix}ban @user [reason]\`\n\`${usedPrefix}banrequest @user [reason]\`\n\`${usedPrefix}timeout @user <min> [reason]\`\n\`${usedPrefix}untimeout @user\`\n\`${usedPrefix}addrole @user <role>\`\n\`${usedPrefix}removerole @user <role>\`` },
        { name: '⚠️ Warning Management', value: `\`${usedPrefix}warn @user [reason]\`\n\`${usedPrefix}warnings [@user]\`\n\`${usedPrefix}removewarning @user <index>\`\n\`${usedPrefix}clearwarnings @user\`` },
        { name: '💬 Chat Tools & Fun', value: `\`${usedPrefix}afk [reason]\`\n\`${usedPrefix}snipe\`\n\`${usedPrefix}coins [@user]\`\n\`${usedPrefix}quote [message]\`\n\`${usedPrefix}sticky <text>\`\n\`${usedPrefix}unsticky\`` },
        { name: '⚙️ Admin Setup', value: `\`${usedPrefix}verify @user\`\n\`${usedPrefix}sendticketpanel\`\n\`${usedPrefix}sendselfiepanel\`\n\`${usedPrefix}config <setting> <value>\`` }
      );

    return message.channel.send({ embeds: [helpEmbed] }).catch(() => {});
  }

  if (command === 'ban') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
      return message.reply('❌ You do not have permission to ban members.');
    }

    const targetMember = message.mentions.members.first();
    const reason = args.slice(1).join(' ') || 'No reason provided';

    if (!targetMember) return message.reply(`Usage: \`${usedPrefix}ban @user [reason]\``);
    if (!targetMember.bannable) return message.reply('❌ I cannot ban this user.');

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
          .setDescription(`**Target User:** <@${target.id}> (${target.tag})\n**Requested By:** <@${message.author.id}>\n**Reason:** ${reason}`)
          .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`req_approve_ban_${target.id}`).setLabel('Approve Ban').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId(`req_deny_ban_${target.id}`).setLabel('Deny Request').setStyle(ButtonStyle.Secondary)
        );

        banReqChan.send({ embeds: [reqEmbed], components: [row] }).catch(() => {});
        message.delete().catch(() => {});
        return message.channel.send(`✅ Ban request submitted to the ban request log for **${target.tag}**.`);
      }
    }
    return message.reply('⚠️️ Ban request channel ID is not configured.');
  }

  if (command === 'warn') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return;
    const target = message.mentions.members.first();
    const reason = args.slice(1).join(' ') || 'No reason provided';
    if (!target) return message.reply(`Usage: \`${usedPrefix}warn @user [reason]\``);

    const userWarns = db.warnings.get(target.id) || [];
    userWarns.push({ reason, staff: message.author.tag, date: new Date().toISOString() });
    db.warnings.set(target.id, userWarns);
    await saveDB();

    logPunishment(message.guild, '⚠️ Warning Issued', `User: <@${target.id}>\nModerator: <@${message.author.id}>\nReason:${reason}`);
    target.send(`⚠️ You received a warning in **${message.guild.name}**\n**Reason:** ${reason}`).catch(() => {});
    return message.channel.send(`Warned **${target.user.tag}**. Total warnings: **${userWarns.length}**`);
  }

  if (command === 'warnings') {
    const target = message.mentions.users.first() || message.author;
    const logs = db.warnings.get(target.id) || [];
    if (logs.length === 0) return message.reply(`**${target.username}** has no recorded warnings.`);

    const warnEmbed = new EmbedBuilder()
      .setColor('#ED4245')
      .setTitle(`⚠️ Warning Log — ${target.username}`)
      .setDescription(logs.map((w, i) => `**#${i + 1}** - *${w.reason}* (By:${w.staff})`).join('\n'));

    return message.channel.send({ embeds: [warnEmbed] });
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
      return message.reply(`Your **${game.toUpperCase()}** rank (**${rank}**) requires staff approval and was sent to verification logs!`);
    } else {
      userProfile[game] = { rank, verified: true };
      db.userRanks.set(message.author.id, userProfile);
      await saveDB();
      return message.reply(`✅ Your **${game.toUpperCase()}** rank has been saved as **${rank}**!`);
    }
  }

  if (command === 'verify') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return;
    const targetMember = message.mentions.members.first();
    if (!targetMember) return message.reply(`Usage: \`${usedPrefix}verify @user\``);

    if (db.config.verifiedRoleId) {
      const verifiedRole = message.guild.roles.cache.get(db.config.verifiedRoleId);
      if (verifiedRole) {
        await targetMember.roles.add(verifiedRole).catch(console.error);
        message.delete().catch(() => {});
        return message.channel.send(`📸 Verified **${targetMember.user.tag}** and added **${verifiedRole.name}**!`);
      }
    }
    return message.reply('⚠️ Verified Role ID not properly configured.');
  }

  if (command === 'rank') {
    const target = message.mentions.users.first() || message.author;
    const profile = db.userRanks.get(target.id);

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

  if (command === 'afk') {
    const reason = args.join(' ') || 'AFK';
    db.afkUsers.set(message.author.id, reason);
    await saveDB();
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
    return message.reply(`🪙 **${target.username}** has **${db.userCoins.get(target.id) || 0}** coins.`);
  }

  if (command === 'sticky') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) return;
    const stickyText = args.join(' ');
    if (!stickyText) return message.reply(`Usage: \`${usedPrefix}sticky <text>\``);

    db.stickyMessages.set(message.channel.id, stickyText);
    await saveDB();
    message.delete().catch(() => {});
    return message.channel.send(`📌 **Sticky Note Set:**\n${stickyText}`);
  }

  if (command === 'unsticky') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) return;
    db.stickyMessages.delete(message.channel.id);
    await saveDB();
    message.delete().catch(() => {});
    return message.channel.send('Removed sticky message.');
  }

  if (command === 'sendticketpanel') {
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

  if (command === 'sendselfiepanel') {
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
// 7. INTERACTION HANDLER (BUTTONS & MODALS)
// ==========================================
client.on('interactionCreate', async (interaction) => {
  const db = await getDB();

  if (interaction.isButton()) {
    // TICKET CREATION
    if (interaction.customId === 'open_ticket') {
      const guild = interaction.guild;
      const user = interaction.user;
      
      const permissions = [
        { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
      ];

      if (db.config.staffRoleId) {
        permissions.push({ id: db.config.staffRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] });
      }

      const ticketChan = await guild.channels.create({
        name: `ticket-${user.username.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
        type: ChannelType.GuildText,
        permissionOverwrites: permissions,
      }).catch(console.error);

      if (ticketChan) {
        if (db.config.staffRoleId) ticketChan.send(`<@&${db.config.staffRoleId}> New ticket from <@${user.id}>!`).catch(() => {});
        
        const controlEmbed = new EmbedBuilder()
          .setColor('#5865F2')
          .setTitle('⚙️ Ticket Management Panel')
          .setDescription(`Welcome <@${user.id}>! Staff will be with you shortly.\n\n**Owner/Admin Controls below:**`);

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

    // TICKET ADMIN CONTROLS
    if (interaction.customId.startsWith('ticket_')) {
      const isOwnerOrAdmin = interaction.user.id === interaction.guild.ownerId || interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);

      if (interaction.customId === 'ticket_close') {
        if (!isOwnerOrAdmin) {
          return interaction.reply({ content: '❌ Only Server Owners/Admins can close tickets.', ephemeral: true });
        }
        await interaction.reply('🔒 Closing and deleting ticket in 5 seconds...');
        setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
      }

      if (interaction.customId === 'ticket_claim') {
        if (!isOwnerOrAdmin) {
          return interaction.reply({ content: '❌ Only Server Owners/Admins can claim tickets.', ephemeral: true });
        }
        await interaction.reply(`🙋 Ticket claimed by <@${interaction.user.id}>!`);
      }

      if (interaction.customId === 'ticket_unclaim') {
        if (!isOwnerOrAdmin) {
          return interaction.reply({ content: '❌ Only Server Owners/Admins can unclaim tickets.', ephemeral: true });
        }
        await interaction.reply(`🚪 Ticket unclaimed by <@${interaction.user.id}>.`);
      }

      if (interaction.customId === 'ticket_hide') {
        if (!isOwnerOrAdmin) {
          return interaction.reply({ content: '❌ Only Server Owners/Admins can hide tickets.', ephemeral: true });
        }

        if (db.config.staffRoleId) {
          await interaction.channel.permissionOverwrites.edit(db.config.staffRoleId, {
            ViewChannel: false
          }).catch(console.error);
        }

        await interaction.reply('🙈 Ticket hidden! Non-admin staff can no longer view this channel.');
      }

      if (interaction.customId === 'ticket_add_member') {
        if (!isOwnerOrAdmin) {
          return interaction.reply({ content: '❌ Only Server Owners/Admins can manage ticket members.', ephemeral: true });
        }
        const modal = new ModalBuilder()
          .setCustomId('modal_ticket_add_member')
          .setTitle('Add Member to Ticket');

        const userInput = new TextInputBuilder()
          .setCustomId('user_id')
          .setLabel('User ID to Add')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('e.g. 123456789012345678')
          .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(userInput));
        await interaction.showModal(modal);
      }

      if (interaction.customId === 'ticket_remove_member') {
        if (!isOwnerOrAdmin) {
          return interaction.reply({ content: '❌ Only Server Owners/Admins can manage ticket members.', ephemeral: true });
        }
        const modal = new ModalBuilder()
          .setCustomId('modal_ticket_remove_member')
          .setTitle('Remove Member from Ticket');

        const userInput = new TextInputBuilder()
          .setCustomId('user_id')
          .setLabel('User ID to Remove')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('e.g. 123456789012345678')
          .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(userInput));
        await interaction.showModal(modal);
      }
    }

    // BAN REQUESTS
    if (interaction.customId.startsWith('req_')) {
      const parts = interaction.customId.split('_');
      const action = parts[1];
      const targetId = parts[3];

      if (action === 'approve') {
        const member = await interaction.guild.members.fetch(targetId).catch(() => null);
        const originalEmbed = interaction.message.embeds[0];
        const updatedEmbed = EmbedBuilder.from(originalEmbed)
          .setColor('#57F287')
          .setTitle('🔨 Ban Request Approved')
          .addFields({ name: 'Reviewed By', value: `<@${interaction.user.id}> (${interaction.user.tag})` });

        if (member) {
          await member.ban({ reason: `Ban request approved by ${interaction.user.tag}` }).catch(console.error);
          await interaction.update({ embeds: [updatedEmbed], components: [] });
        } else {
          await interaction.update({ content: `❌ Target member left or was not found, but marked as approved by <@${interaction.user.id}>.`, embeds: [updatedEmbed], components: [] });
        }
      } else if (action === 'deny') {
        const modal = new ModalBuilder()
          .setCustomId(`ban_deny_modal_${targetId}`)
          .setTitle('Ban Request Denial');

        const reasonInput = new TextInputBuilder()
          .setCustomId('deny_reason')
          .setLabel('Reason for Denying Ban Request')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('Provide a reason for denying this request...')
          .setRequired(true);

        const row = new ActionRowBuilder().addComponents(reasonInput);
        modal.addComponents(row);

        await interaction.showModal(modal);
      }
    }

    // RANK VERIFICATION
    if (interaction.customId.startsWith('verify_rank_')) {
      const parts = interaction.customId.split('_');
      const action = parts[2];
      const targetId = parts[3];
      const game = parts[4];

      const userProfile = db.userRanks.get(targetId);
      if (userProfile && userProfile[game]) {
        if (action === 'approve') {
          userProfile[game].verified = true;
          db.userRanks.set(targetId, userProfile);
          await saveDB();
          await interaction.update({ content: `✅ Rank approved for <@${targetId}> on **${game}** by <@${interaction.user.id}>!`, components: [] });
        } else {
          delete userProfile[game];
          db.userRanks.set(targetId, userProfile);
          await saveDB();
          await interaction.update({ content: `❌ Rank denied for <@${targetId}> on **${game}** by <@${interaction.user.id}>.`, components: [] });
        }
      }
    }
  }

  // MODAL SUBMISSIONS
  if (interaction.isModalSubmit()) {
    if (interaction.customId === 'modal_ticket_add_member') {
      const targetId = interaction.fields.getTextInputValue('user_id');
      await interaction.channel.permissionOverwrites.edit(targetId, {
        ViewChannel: true,
        SendMessages: true
      }).catch(console.error);
      await interaction.reply(`➕ Added <@${targetId}> to the ticket.`);
    }

    if (interaction.customId === 'modal_ticket_remove_member') {
      const targetId = interaction.fields.getTextInputValue('user_id');
      await interaction.channel.permissionOverwrites.delete(targetId).catch(console.error);
      await interaction.reply(`➖ Removed <@${targetId}> from the ticket.`);
    }

    if (interaction.customId.startsWith('ban_deny_modal_')) {
      const denyReason = interaction.fields.getTextInputValue('deny_reason');

      const originalEmbed = interaction.message.embeds[0];
      const updatedEmbed = EmbedBuilder.from(originalEmbed)
        .setColor('#ED4245')
        .setTitle('❌ Ban Request Denied')
        .addFields(
          { name: 'Denied By', value: `<@${interaction.user.id}> (${interaction.user.tag})` },
          { name: 'Denial Reason', value: denyReason }
        );

      await interaction.update({ embeds: [updatedEmbed], components: [] });
    }
  }
});

// ==========================================
// 8. HELPER LOGGING FUNCTIONS
// ==========================================
async function logPunishment(guild, title, desc) {
  const db = await getDB();
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
