import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  StringSelectMenuBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { prisma } from '../../lib/db.js';

type ShopCat = 'TOOL' | 'CONSUMABLE' | 'MATERIAL' | 'WEAPON' | 'ARMOR' | 'MISC';

const LABEL: Record<ShopCat, string> = {
  TOOL: 'Herramientas',
  CONSUMABLE: 'Consumibles',
  MATERIAL: 'Materiales',
  WEAPON: 'Armas',
  ARMOR: 'Armaduras',
  MISC: 'Varios',
};
const ICON: Record<ShopCat, string> = {
  TOOL: '🛠️', CONSUMABLE: '🧪', MATERIAL: '🪨', WEAPON: '⚔️', ARMOR: '🛡️', MISC: '🎁',
};

const PAGE_SIZE = 10;

function buildSelect(cat: ShopCat) {
  const sel = new StringSelectMenuBuilder()
    .setCustomId('shop:cat')
    .setPlaceholder('Elegir categoría…')
    .addOptions((Object.keys(LABEL) as ShopCat[]).map(c => ({
      label: LABEL[c],
      value: c,
      emoji: ICON[c],
      default: c === cat,
    })));
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(sel);
}

function buildPager(cat: ShopCat, page: number, totalPages: number) {
  const prev = new ButtonBuilder()
    .setCustomId(`shop:prev:${cat}:${page}`)
    .setLabel('◀︎')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(page <= 1);
  const next = new ButtonBuilder()
    .setCustomId(`shop:next:${cat}:${page}`)
    .setLabel('▶︎')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(page >= totalPages);
  return new ActionRowBuilder<ButtonBuilder>().addComponents(prev, next);
}

function fmt(i: any) {
  const tier = i.tier ? ` T${i.tier}` : '';
  const power = i.power ? ` · Poder ${i.power}` : '';
  return `• **${i.name}**${tier}${power} — **${i.price} V**`;
}

async function getFiltered(cat: ShopCat) {
  // 1) Trae desde la DB por tipo y precio
  const rows = await prisma.item.findMany({
    where: { type: cat, price: { gt: 0 } },
    orderBy: [{ price: 'asc' }, { name: 'asc' }],
  });
  // 2) Filtra en JS si metadata.buyable === false
  return rows.filter(r => {
    const meta: any = r.metadata ?? {};
    return meta.buyable !== false;
  });
}

async function fetchPage(cat: ShopCat, page: number) {
  const all = await getFiltered(cat);
  const total = all.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const p = Math.min(Math.max(1, page), totalPages);
  const slice = all.slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE);

  const embed = new EmbedBuilder()
    .setTitle(`${ICON[cat]} Tienda — ${LABEL[cat]}`)
    .setColor(0x15c17a)
    .setDescription(slice.length ? slice.map(fmt).join('\n') : 'No hay artículos en esta categoría.')
    .setFooter({ text: `Página ${p}/${totalPages} — Compra usando /buy <item>` });

  return { embed, page: p, totalPages };
}

export default {
  data: new SlashCommandBuilder()
    .setName('shop')
    .setDescription('Ver la tienda por categorías (desde la base de datos).'),
  ns: 'shop',
  async execute(interaction: ChatInputCommandInteraction) {
    const cat: ShopCat = 'TOOL';
    const { embed, page, totalPages } = await fetchPage(cat, 1);
    await interaction.reply({
      embeds: [embed],
      components: [buildSelect(cat), buildPager(cat, page, totalPages)],
    });
  },
  async handleInteraction(interaction: any) {
    if (interaction.isStringSelectMenu() && interaction.customId === 'shop:cat') {
      const cat = interaction.values[0] as ShopCat;
      const { embed, page, totalPages } = await fetchPage(cat, 1);
      return interaction.update({
        embeds: [embed],
        components: [buildSelect(cat), buildPager(cat, page, totalPages)],
      });
    }
    if (interaction.isButton() && interaction.customId.startsWith('shop:')) {
      const [, kind, catStr, pageStr] = interaction.customId.split(':');
      const cat = catStr as ShopCat;
      let page = Number(pageStr) || 1;
      if (kind === 'prev') page = Math.max(1, page - 1);
      if (kind === 'next') page = page + 1;
      const { embed, page: fixed, totalPages } = await fetchPage(cat, page);
      return interaction.update({
        embeds: [embed],
        components: [buildSelect(cat), buildPager(cat, fixed, totalPages)],
      });
    }
  },
};