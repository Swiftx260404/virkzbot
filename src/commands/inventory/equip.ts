import { SlashCommandBuilder, ChatInputCommandInteraction, AutocompleteInteraction } from 'discord.js';
import { prisma } from '../../lib/db.js';

export default {
  data: new SlashCommandBuilder()
    .setName('equip')
    .setDescription('Equipar una herramienta (pico/caña).')
    .addStringOption(o => o.setName('item').setDescription('Nombre o clave del item').setRequired(true).setAutocomplete(true)),
  async execute(interaction: ChatInputCommandInteraction) {
    const uid = interaction.user.id;
    const keyOrName = interaction.options.getString('item', true).toLowerCase();
    const inv = await prisma.userItem.findMany({ where: { userId: uid }, include: { item: true } });
    const match = inv.find(x => x.item.key.toLowerCase() === keyOrName || x.item.name.toLowerCase().includes(keyOrName));
    if (!match) return interaction.reply({ content: 'No tienes ese ítem.', ephemeral: true });

    const it = match.item;
    if (it.toolKind === 'PICKAXE') {
      await prisma.user.update({ where: { id: uid }, data: { equippedPickaxeId: it.id } });
      return interaction.reply({ content: `⛏️ Equipaste **${it.name}**.` });
    }
    if (it.toolKind === 'ROD') {
      await prisma.user.update({ where: { id: uid }, data: { equippedRodId: it.id } });
      return interaction.reply({ content: `🎣 Equipaste **${it.name}**.` });
    }
    return interaction.reply({ content: 'Ese ítem no es equipable como herramienta.', ephemeral: true });
  },
  async autocomplete(interaction: AutocompleteInteraction) {
    const uid = interaction.user.id;
    const inv = await prisma.userItem.findMany({ where: { userId: uid }, include: { item: true } });
    const tools = inv.filter(x => ['PICKAXE','ROD'].includes(x.item.toolKind as string)).map(x => x.item);
    const focused = interaction.options.getFocused().toLowerCase();
    const opts = tools.filter(t => t.name.toLowerCase().includes(focused) || t.key.toLowerCase().includes(focused))
      .slice(0, 25)
      .map(t => ({ name: `${t.name} (T${t.tier})`, value: t.key }));
    await interaction.respond(opts);
  }
}
