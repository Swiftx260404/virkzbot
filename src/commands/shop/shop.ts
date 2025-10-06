import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  StringSelectMenuBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { ItemType } from '@prisma/client';
import { prisma } from '../../lib/db.js';

type ShopCat =
  | 'TOOL'
  | 'CONSUMABLE'
  | 'MATERIAL'
  | 'WEAPON'
  | 'ARMOR'
  | 'PET'
  | 'COSMETIC'
  | 'CHARM'
  | 'SUPPORT'
  | 'MISC';

const LABEL: Record<ShopCat, string> = {
  TOOL: 'Herramientas',
  CONSUMABLE: 'Consumibles',
  MATERIAL: 'Materiales',
  WEAPON: 'Armas',
  ARMOR: 'Armaduras',
  PET: 'Mascotas',
  COSMETIC: 'Cosméticos',
  CHARM: 'Amuletos',
  SUPPORT: 'Planos & Soporte',
  MISC: 'Coleccionables',
};
const ICON: Record<ShopCat, string> = {
  TOOL: '🛠️',
  CONSUMABLE: '🧪',
  MATERIAL: '🪨',
  WEAPON: '⚔️',
  ARMOR: '🛡️',
  PET: '🐾',
  COSMETIC: '✨',
  CHARM: '🔮',
  SUPPORT: '📜',
  MISC: '🎁',
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
  const base = `• **${i.name}**${tier}${power} — **${i.price} V**`;
  const meta = (i.metadata ?? {}) as any;
  const descParts: string[] = [];
  if (typeof meta.description === 'string') descParts.push(meta.description);
  if (meta.passive && typeof meta.passive === 'object') {
    const passive = Object.entries(meta.passive)
      .map(([k, v]) => `${k.replace(/_/g, ' ')} ${Math.round(Number(v) * 100) / 100}`)
      .join(' · ');
    if (passive) descParts.push(`Pasiva: ${passive}`);
  }
  if (typeof meta.uses === 'number') descParts.push(`Usos: ${meta.uses}`);
  return descParts.length ? `${base}\n   ${descParts.join(' · ')}` : base;
}

const BASE_TYPE: Partial<Record<ShopCat, ItemType>> = {
  TOOL: ItemType.TOOL,
  CONSUMABLE: ItemType.CONSUMABLE,
  MATERIAL: ItemType.MATERIAL,
  WEAPON: ItemType.WEAPON,
  ARMOR: ItemType.ARMOR,
  PET: ItemType.MISC,
  COSMETIC: ItemType.MISC,
  CHARM: ItemType.MISC,
  SUPPORT: ItemType.MISC,
  MISC: ItemType.MISC,
};

const META_FILTER: Partial<Record<ShopCat, (meta: any) => boolean>> = {
  PET: (meta) => meta?.category === 'Pet',
  COSMETIC: (meta) => meta?.category === 'Cosmetic',
  CHARM: (meta) => meta?.category === 'Charm',
  SUPPORT: (meta) => ['Support', 'Blueprint'].includes(meta?.category),
  MISC: (meta) => !meta?.category || ['Pet', 'Cosmetic', 'Charm', 'Support', 'Quest'].indexOf(meta?.category) === -1,
};

async function getFiltered(cat: ShopCat) {
  const baseType = BASE_TYPE[cat] ?? 'MISC';
  const rows = await prisma.item.findMany({
    where: { type: baseType, price: { gt: 0 } },
    orderBy: [{ price: 'asc' }, { name: 'asc' }],
  });
  return rows.filter(r => {
    const meta: any = r.metadata ?? {};
    if (meta.buyable === false) return false;
    const filter = META_FILTER[cat];
    return filter ? filter(meta) : true;
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