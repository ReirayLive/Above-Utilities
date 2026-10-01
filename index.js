const { Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField } = require('discord.js');
const express = require('express');

// ==========================================
// 1. EXPRESS KEEP-ALIVE WEB SERVER
// ==========================================
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Above Utilities is online and running 24/7!');
});

app.listen(PORT, () => {
  console.log(`Web server listening on port ${PORT}`);
});

// ==========================================
// 2. DISCORD CLIENT SETUP
// ==========================================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

// Target Quote Channel ID
const QUOTE_CHANNEL_ID = '1555010046994415697';

client.once('ready', () => {
  console.log(`Logged in successfully as ${client.user.tag}!`);
});

// ==========================================
// 3. COMMAND HANDLER
// ==========================================
client.on('messageCreate', async (message) => {
  // Ignore bot messages and non-prefix messages
  if (message.author.bot) return;

  const prefix = '!';
  if (!message.content.startsWith(prefix)) return;

  const args = message.content.slice(prefix.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  // ------------------------------------------
  // UTILITY COMMANDS
  // ------------------------------------------

  // Command: !ping
  if (command === 'ping') {
    return message.reply(`Pong! 🏓 Latency is ${Date.now() - message.createdTimestamp}ms.`);
  }

  // Command: !help
  if (command === 'help') {
    const helpEmbed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle('Above Utilities - Commands Overview')
      .addFields(
        { name: '📋 General & Utilities', value: '`!ping` - Check latency\n`!help` - Show command list' },
        { name: '📜 Quote Logging', value: '`!quote "Your text" Author` - Log a quote to <#1555010046994415697>' },
        { name: '🛡️ Moderation', value: '`!kick @user [reason]` - Kick member\n`!ban @user [reason]` - Ban member\n`!clear [number]` - Purge messages\n`!mute @user [minutes]` - Timeout member\n`!unmute @user` - Remove timeout' }
      )
      .setFooter({ text: 'Above Utilities 24/7 System' })
      .setTimestamp();

    return message.channel.send({ embeds: [helpEmbed] });
  }

  // ------------------------------------------
  // QUOTE LOGGING COMMAND
  // ------------------------------------------

  // Command: !quote "quote text" Author
  if (command === 'quote') {
    const fullText = args.join(' ');
    const quoteMatch = fullText.match(/"([^"]+)"\s*(.*)/) || fullText.match(/“([^”]+)”\s*(.*)/);

    if (!quoteMatch) {
      return message.reply('Invalid format! Use: `!quote "Your quote text here" Author Name`');
    }

    const quoteText = quoteMatch[1];
    const quoteAuthor = quoteMatch[2] || 'Unknown';

    const quoteChannel = message.guild.channels.cache.get(QUOTE_CHANNEL_ID);

    if (!quoteChannel) {
      return message.reply(`Could not find target quote channel (ID: ${QUOTE_CHANNEL_ID}). Please verify channel ID and permissions.`);
    }

    const quoteEmbed = new EmbedBuilder()
      .setColor('#FEE75C')
      .setTitle('📜 New Quote Logged')
      .setDescription(`*"${quoteText}"*`)
      .addFields(
        { name: 'Author', value: quoteAuthor, inline: true },
        { name: 'Logged By', value: `<@${message.author.id}>`, inline: true }
      )
      .setTimestamp();

    try {
      await quoteChannel.send({ embeds: [quoteEmbed] });
      return message.reply(`Quote successfully logged to <#${QUOTE_CHANNEL_ID}>!`);
    } catch (err) {
      console.error('Error posting quote embed:', err);
      return message.reply('Failed to post the quote. Ensure I have permissions to send embeds in the quote channel.');
    }
  }

  // ------------------------------------------
  // MODERATION COMMANDS
  // ------------------------------------------

  // Command: !kick @user [reason]
  if (command === 'kick') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.KickMembers)) {
      return message.reply(' You do not have permission to kick members.');
    }

    const target = message.mentions.members.first();
    if (!target) return message.reply('Please mention a valid member to kick.');
    if (!target.kickable) return message.reply('I cannot kick this user. They may have higher permissions than me.');

    const reason = args.slice(1).join(' ') || 'No reason provided';

    try {
      await target.kick(reason);
      return message.channel.send(` **${target.user.tag}** has been kicked. Reason: *${reason}*`);
    } catch (err) {
      console.error(err);
      return message.reply('Failed to kick the user.');
    }
  }

  // Command: !ban @user [reason]
  if (command === 'ban') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
      return message.reply(' You do not have permission to ban members.');
    }

    const target = message.mentions.members.first();
    if (!target) return message.reply('Please mention a valid member to ban.');
    if (!target.bannable) return message.reply('I cannot ban this user. They may have higher permissions than me.');

    const reason = args.slice(1).join(' ') || 'No reason provided';

    try {
      await target.ban({ reason });
      return message.channel.send(`⛔ **${target.user.tag}** has been banned. Reason: *${reason}*`);
    } catch (err) {
      console.error(err);
      return message.reply('Failed to ban the user.');
    }
  }

  // Command: !clear [number]
  if (command === 'clear' || command === 'purge') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
      return message.reply(' You do not have permission to manage messages.');
    }

    const count = parseInt(args[0], 10);
    if (isNaN(count) || count < 1 || count > 100) {
      return message.reply('Please provide a number between 1 and 100 for messages to delete.');
    }

    try {
      await message.channel.bulkDelete(count + 1, true);
      const msg = await message.channel.send(`🧹 Cleared **${count}** messages.`);
      setTimeout(() => msg.delete().catch(() => {}), 3000);
    } catch (err) {
      console.error(err);
      return message.reply('Failed to delete messages. Note: Discord does not allow deleting messages older than 14 days in bulk.');
    }
  }

  // Command: !mute @user [minutes]
  if (command === 'mute' || command === 'timeout') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
      return message.reply(' You do not have permission to timeout members.');
    }

    const target = message.mentions.members.first();
    if (!target) return message.reply('Please mention a valid member to mute.');

    const minutes = parseInt(args[1], 10) || 10; // Default 10 mins
    const durationMs = minutes * 60 * 1000;

    try {
      await target.timeout(durationMs, 'Timed out via bot command');
      return message.channel.send(`🔇 **${target.user.tag}** has been muted for ${minutes} minute(s).`);
    } catch (err) {
      console.error(err);
      return message.reply('Failed to mute the user.');
    }
  }

  // Command: !unmute @user
  if (command === 'unmute') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
      return message.reply(' You do not have permission to manage timeouts.');
    }

    const target = message.mentions.members.first();
    if (!target) return message.reply('Please mention a valid member to unmute.');

    try {
      await target.timeout(null, 'Timeout removed via bot command');
      return message.channel.send(`🔊 **${target.user.tag}** is no longer muted.`);
    } catch (err) {
      console.error(err);
      return message.reply('Failed to unmute the user.');
    }
  }
});

// ==========================================
// 4. LOGIN & INITIALIZATION CHECK
// ==========================================
if (!process.env.DISCORD_TOKEN) {
  console.error("CRITICAL ERROR: DISCORD_TOKEN environment variable is missing or undefined!");
  process.exit(1);
}

client.login(process.env.DISCORD_TOKEN).catch(err => {
  console.error("LOGIN FAILED:", err);
});
