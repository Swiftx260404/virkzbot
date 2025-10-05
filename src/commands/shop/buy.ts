import { SlashCommandBuilder, ChatInputCommandInteraction, AutocompleteInteraction } from 'discord.js';
import { prisma } from '../../lib/db.js';
import items from '../../data/items.json' assert { type: 'json' };

export default {
  data: new SlashCommandBuilder()
    .setName('buy')
    .setDescription('Comprar un ítem de la tienda.')
    .addStringOption(o => o.setName('item').setDescription('Nombre del item').setRequired(true).setAutocomplete(true))
    .addIntegerOption(o => o.setName('cantidad').setDescription('Cantidad').setMinValue(1).setRequired(false)),
  async execute(interaction: ChatInputCommandInteraction) {
    const uid = interaction.user.id;
    const user = await prisma.user.findUnique({ where: { id: uid } });
    if (!user) return interaction.reply({ content: 'Usa `/start` primero.', ephemeral: true });

    const itemName = interaction.options.getString('item', true);
    const qty = interaction.options.getInteger('cantidad') ?? 1;
    const item = items.find(i => i.name.toLowerCase().includes(itemName.toLowerCase()) || i.key.toLowerCase() === itemName.toLowerCase());
    if (!item) return interaction.reply({ content: 'Item no encontrado. Usa `/shop`.', ephemeral: true });

    const cost = item.price * qty;
    if (user.vcoins < cost) return interaction.reply({ content: `No tienes suficientes V Coins. Te faltan ${cost - user.vcoins}.`, ephemeral: true });

    // get or create item in DB
    let dbItem = await prisma.item.findUnique({ where: { key: item.key } });
    if (!dbItem) dbItem = await prisma.item.create({ data: item as any });

    await prisma.$transaction([
      prisma.user.update({ where: { id: uid }, data: { vcoins: { decrement: cost } } }),
      prisma.userItem.upsert({
        where: { userId_itemId: { userId: uid, itemId: dbItem.id } },
        update: { quantity: { increment: qty } },
        create: { userId: uid, itemId: dbItem.id, quantity: qty }
      })
    ]);
    await interaction.reply({ content: `✅ Compraste **${qty} × ${item.name}** por **${cost} V**.` });
  },
  async autocomplete(interaction: AutocompleteInteraction) {
    const focused = interaction.options.getFocused().toLowerCase();
    const opts = items
      .filter(i => i.name.toLowerCase().includes(focused) || i.key.toLowerCase().includes(focused))
      .slice(0, 25)
      .map(i => ({ name: `${i.name} (${i.price} V)`, value: i.key }));
    await interaction.respond(opts);
  }
}
