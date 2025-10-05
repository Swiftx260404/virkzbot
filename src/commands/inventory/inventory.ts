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

type Cat = 'ALL' | 'TOOL' | 'MATERIAL' | 'CONSUMABLE' | 'WEAPON' | 'ARMOR' | 'PET' | 'MISC';

const CAT_LABEL: Record<Cat, string> = {
  ALL: 'Todo',
  TOOL: 'Herramientas',
  MATERIAL: 'Materiales',
  CONSUMABLE: 'Consumibles',
  WEAPON: 'Armas',
  ARMOR: 'Armaduras',
  PET: 'Mascotas',
  MISC: 'Varios',
};

const CAT_EMOJI: Record<Cat, string> = {
  ALL: '🎒',
  TOOL: '🛠️',
  MATERIAL: '🪨',
  CONSUMABLE: '🧪',
  WEAPON: '⚔️',
  ARMOR: '🛡️',
  PET: '🐾',
  MISC: '🎁',
};

const PAGE_SIZE = 10;

function buildSelect(current: Cat) {
  const select = new StringSelectMenuBuilder()
    .setCustomId('inventory:cat')
    .setPlaceholder('Filtrar categoría…')
    .addOptions(
      (Object.keys(CAT_LABEL) as Cat[]).map((c) => ({
        label: `${CAT_LABEL[c]}`,
        value: c,
        emoji: CAT_EMOJI[c],
        default: c === current,
      })),
    );
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
}

function buildPager(cat: Cat, page: number, totalPages: number) {
  const prev = new ButtonBuilder()
    .setCustomId(`inventory:prev:${cat}:${page}`)
    .setLabel('◀︎ Anterior')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(page <= 1);

  const next = new ButtonBuilder()
    .setCustomId(`inventory:next:${cat}:${page}`)
    .setLabel('Siguiente ▶︎')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(page >= totalPages);

  const refresh = new ButtonBuilder()
    .setCustomId(`inventory:refresh:${cat}:${page}`)
    .setLabel('🔄 Actualizar')
    .setStyle(ButtonStyle.Primary);

  return new ActionRowBuilder<ButtonBuilder>().addComponents(prev, next, refresh);
}

function formatLine(x: any) {
  const it = x.item;
  const qty = x.quantity;
  const tier = it.tier ? ` T${it.tier}` : '';
  const extra =
    it.toolKind && it.toolKind !== 'NONE'
      ? ` ${it.toolKind === 'PICKAXE' ? '⛏️' : it.toolKind === 'ROD' ? '🎣' : ''}`
      : '';
  return `• **x${qty}** — ${it.name}${tier}${extra}`;
}

async function renderEmbed(uid: string, cat: Cat, page: number) {
  const where = { userId: uid } as any;
  if (cat !== 'ALL') {
    where.item = { type: cat }; // prisma permite nested where por relación
  }

  const total = await prisma.userItem.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const p = Math.min(Math.max(1, page), totalPages);

  const items = await prisma.userItem.findMany({
    where,
    include: { item: true },
    orderBy: [{ item: { type: 'asc' } }, { item: { name: 'asc' } }],
    skip: (p - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });

  const embed = new EmbedBuilder()
    .setTitle(`${CAT_EMOJI[cat]} Inventario — ${CAT_LABEL[cat]}`)
    .setColor(0x00a3ff)
    .setDescription(
      items.length
        ? items.map(formatLine).join('\n')
        : 'No tienes ítems en esta categoría.',
    )
    .setFooter({ text: `Página ${p}/${totalPages} — Total: ${total}` });

  return { embed, totalPages, page: p };
}

export default {
  data: new SlashCommandBuilder().setName('inventory').setDescription('Ver tu inventario con filtros y paginación.'),
  ns: 'inventory',
  async execute(interaction: ChatInputCommandInteraction) {
    const uid = interaction.user.id;
    const anyItem = await prisma.userItem.findFirst({ where: { userId: uid } });
    if (!anyItem) {
      return interaction.reply({
        content: 'Tu inventario está vacío. Compra algo en `/shop`.',
        ephemeral: true,
      });
    }

    const cat: Cat = 'ALL';
    const page = 1;
    const { embed, totalPages } = await renderEmbed(uid, cat, page);
    const rowSelect = buildSelect(cat);
    const rowPager = buildPager(cat, page, totalPages);

    await interaction.reply({ embeds: [embed], components: [rowSelect, rowPager] });
  },

  async handleInteraction(interaction: any) {
    const uid = interaction.user.id;

    // Select de categoría
    if (interaction.isStringSelectMenu() && interaction.customId === 'inventory:cat') {
      const cat = (interaction.values[0] as Cat) || 'ALL';
      const page = 1;
      const { embed, totalPages } = await renderEmbed(uid, cat, page);
      const rowSelect = buildSelect(cat);
      const rowPager = buildPager(cat, page, totalPages);
      return interaction.update({ embeds: [embed], components: [rowSelect, rowPager] });
    }

    // Botones de paginación/refresh
    if (interaction.isButton() && interaction.customId.startsWith('inventory:')) {
      const [, kind, catStr, pageStr] = interaction.customId.split(':'); // inventory:prev:CAT:page
      const cat = (catStr as Cat) || 'ALL';
      let page = Number(pageStr) || 1;
      if (kind === 'prev') page = Math.max(1, page - 1);
      if (kind === 'next') page = page + 1;
      // refresh deja igual

      const { embed, totalPages, page: fixed } = await renderEmbed(uid, cat, page);
      const rowSelect = buildSelect(cat);
      const rowPager = buildPager(cat, fixed, totalPages);
      return interaction.update({ embeds: [embed], components: [rowSelect, rowPager] });
    }
  },
};