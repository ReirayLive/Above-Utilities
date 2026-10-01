const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const express = require('express');

// Express server to keep the bot alive on free hosting
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Bot is active and running 24/7!');
});

app.listen(PORT, () => {
  console.log(`Web server listening on port ${PORT}`);
});

// Initialize Discord Client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ]
});

// Target Quote Log Channel ID
const QUOTE_CHANNEL_ID = '1555010046994415697';

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

// Command Listener
client.on('messageCreate', async (message) => {
  // Ignore messages sent by bots
  if (message.author.bot) return;

  // Check if message starts with !quote
  if (message.content.startsWith('!quote')) {
    const args = message.content.slice(7).trim();
    
    // Check if the user provided arguments
    if (!args) {
      return message.reply('Usage: `!quote "Your quote here" Author Name`');
    }

    // Match quote text inside quotes and the author following it
    const match = args.match(/^"([^"]+)"\s+(.+)$/);
    if (!match) {
      return message.reply('Please wrap the quote in quotation marks. Example: `!quote "Hello world" @User`');
    }

    const quoteText = match[1];
    const authorText = match[2];

    // Get the quote log channel
    const quoteChannel = client.channels.cache.get(QUOTE_CHANNEL_ID);
    if (!quoteChannel) {
      return message.reply('Could not find the target quote log channel. Check bot permissions!');
    }

    // Format the quote into a clean Discord embed
    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setDescription(`*"${quoteText}"*`)
      .addFields({ name: 'Quoted Author', value: authorText, inline: true })
      .setFooter({ 
        text: `Logged by ${message.author.tag}`, 
        iconURL: message.author.displayAvatarURL() 
      })
      .setTimestamp();

    // Send embed to target channel & confirm to user
    await quoteChannel.send({ embeds: [embed] });
    await message.reply(`Quote successfully logged to <#${QUOTE_CHANNEL_ID}>!`);
  }
});

// Log in using environment variable
if (!process.env.DISCORD_TOKEN) {
  console.error("CRITICAL ERROR: DISCORD_TOKEN environment variable is missing or undefined!");
  process.exit(1);
}

client.login(process.env.DISCORD_TOKEN).catch(err => {
  console.error("LOGIN FAILED:", err);
});
