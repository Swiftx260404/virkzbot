import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import items from '../../data/items.json' assert { type: 'json' };

export default {
  data: new SlashCommandBuilder().setName('shop').setDescription('Ver la tienda por categorías.'),
  async execute(interaction: ChatInputCommandInteraction) {
    const tools = items.filter(i => i.type === 'TOOL');
    const consum = items.filter(i => i.type === 'CONSUMABLE');
    const embed = new EmbedBuilder()
      .setTitle('🛒 Tienda')
      .setDescription('Compra con `/buy <item>`')
      .addFields(
        { name: 'Herramientas', value: tools.map(t => `**${t.name}** (T${t.tier}) — ${t.price} V`).join('\n').slice(0, 1024) || '—' },
        { name: 'Consumibles', value: consum.map(c => `**${c.name}** — ${c.price} V`).join('\n').slice(0, 1024) || '—' }
      );
    await interaction.reply({ embeds: [embed] });
  }
}
