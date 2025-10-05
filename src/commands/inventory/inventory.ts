import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { prisma } from '../../lib/db.js';

export default {
  data: new SlashCommandBuilder().setName('inventory').setDescription('Ver tu inventario.'),
  async execute(interaction: ChatInputCommandInteraction) {
    const uid = interaction.user.id;
    const inv = await prisma.userItem.findMany({ where: { userId: uid }, include: { item: true } });
    if (!inv.length) return interaction.reply({ content: 'Tu inventario está vacío. Compra algo en `/shop`.', ephemeral: true });
    const tools = inv.filter(x => x.item.type === 'TOOL');
    const mats = inv.filter(x => x.item.type === 'MATERIAL');
    const consum = inv.filter(x => x.item.type === 'CONSUMABLE');
    const embed = new EmbedBuilder().setTitle('🎒 Inventario');
    if (tools.length) embed.addFields({ name: 'Herramientas', value: tools.map(t => `x${t.quantity} — ${t.item.name} (T${t.item.tier ?? '-'}${t.item.toolKind !== 'NONE' ? ' ' + t.item.toolKind : ''})`).join('\n').slice(0, 1024) });
    if (mats.length) embed.addFields({ name: 'Materiales', value: mats.map(m => `x${m.quantity} — ${m.item.name}`).join('\n').slice(0, 1024) });
    if (consum.length) embed.addFields({ name: 'Consumibles', value: consum.map(c => `x${c.quantity} — ${c.item.name}`).join('\n').slice(0, 1024) });
    await interaction.reply({ embeds: [embed] });
  }
}
