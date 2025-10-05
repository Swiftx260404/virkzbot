import 'dotenv/config';
import { Client, GatewayIntentBits, Collection, Interaction, Partials } from 'discord.js';
import { CONFIG } from './config.js';
import { registerAllCommands } from './register.js';
import { prisma } from './lib/db.js';

if (!CONFIG.token || !CONFIG.clientId) {
  console.error('Falta DISCORD_TOKEN o DISCORD_CLIENT_ID en .env');
  process.exit(1);
}

export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

// dynamic command map
export const commands = new Collection<string, any>();

client.once('ready', async () => {
  console.log(`Virkz online como ${client.user?.tag}`);
});

// Load commands dynamically
await registerAllCommands(commands);

client.on('interactionCreate', async (interaction: Interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      const cmd = commands.get(interaction.commandName);
      if (!cmd) return;
      await cmd.execute(interaction);
      return;
    }
    if (interaction.isButton() || interaction.isStringSelectMenu() || interaction.isModalSubmit()) {
      // Route by customId prefix
      const [ns] = interaction.customId.split(':');
      const handler = commands.get(ns);
      if (handler?.handleInteraction) {
        await handler.handleInteraction(interaction);
      }
    }
  } catch (err) {
    console.error(err);
    if (interaction.isRepliable()) {
      await interaction.reply({ content: '❌ Ocurrió un error ejecutando el comando.', ephemeral: True });
    }
  }
});

client.login(CONFIG.token);
