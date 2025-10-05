import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
} from 'discord.js';
import { prisma } from '../../lib/db.js';

async function searchableBuyables(query: string) {
  // Trae candidatos por nombre o key (case-insensitive)
  const rows = await prisma.item.findMany({
    where: {
      price: { gt: 0 },
      OR: [
        { name: { contains: query, mode: 'insensitive' } },
        { key: { contains: query, mode: 'insensitive' } },
      ],
    },
    orderBy: [{ price: 'asc' }, { name: 'asc' }],
    take: 25,
  });
  // Filtra buyable !== false en JS
  return rows.filter(r => (r.metadata as any)?.buyable !== false);
}

export default {
  data: new SlashCommandBuilder()
    .setName('buy')
    .setDescription('Compra un artículo de la tienda.')
    .addStringOption(opt =>
      opt.setName('item')
        .setDescription('Nombre o clave del ítem a comprar.')
        .setAutocomplete(true)     // 👈 habilita autocomplete
        .setRequired(true))
    .addIntegerOption(opt =>
      opt.setName('cantidad')
        .setDescription('Cantidad a comprar (por defecto 1)')
        .setMinValue(1)
        .setMaxValue(99)),
  async execute(interaction: ChatInputCommandInteraction) {
    const uid = interaction.user.id;
    const user = await prisma.user.findUnique({ where: { id: uid } });
    if (!user) return interaction.reply({ content: 'Usa `/start` primero.', ephemeral: true });

    const input = interaction.options.getString('item', true);
    const qty = interaction.options.getInteger('cantidad') ?? 1;

    // Busca por key exacta primero, luego por nombre exacto, luego por contains
    let item = await prisma.item.findFirst({
      where: { key: { equals: input, mode: 'insensitive' }, price: { gt: 0 } },
    });
    if (!item) {
      item = await prisma.item.findFirst({
        where: { name: { equals: input, mode: 'insensitive' }, price: { gt: 0 } },
      });
    }
    if (!item) {
      const matches = await searchableBuyables(input);
      item = matches[0];
    }
    if (!item || (item.metadata as any)?.buyable === false) {
      return interaction.reply({ content: `❌ No encontré **${input}** en la tienda.`, ephemeral: true });
    }

    const totalCost = item.price * qty;
    if (user.vcoins < totalCost)
      return interaction.reply({
        content: `💸 Te faltan **${totalCost - user.vcoins} V Coins** para comprar ${qty} × ${item.name}.`,
        ephemeral: true,
      });

    await prisma.$transaction([
      prisma.user.update({
        where: { id: uid },
        data: { vcoins: { decrement: totalCost } },
      }),
      prisma.userItem.upsert({
        where: { userId_itemId: { userId: uid, itemId: item.id } },
        update: { quantity: { increment: qty } },
        create: { userId: uid, itemId: item.id, quantity: qty },
      }),
    ]);

    await interaction.reply({
      content: `✅ Compraste **${qty} × ${item.name}** por **${totalCost} V Coins**.`,
      ephemeral: true,
    });
  },

  // 🔎 Autocomplete
  async autocomplete(interaction: AutocompleteInteraction) {
    const query = interaction.options.getFocused() ?? '';
    const rows = await searchableBuyables(String(query));
    const options = rows.slice(0, 25).map(r => ({
      name: `${r.name} — ${r.price} V`,
      value: r.key, // devolvemos la key para precisión al ejecutar
    }));
    await interaction.respond(options);
  },
};