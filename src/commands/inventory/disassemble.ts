import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ButtonInteraction,
} from 'discord.js';
import { prisma } from '../../lib/db.js';
import { ensureInventoryCapacity } from '../../services/inventory.js';

interface YieldPreview {
  itemKey: string;
  itemName: string;
  min: number;
  max: number;
  chance?: number;
}

function parseConfig(metadata: any) {
  if (!metadata || typeof metadata !== 'object') return null;
  const conf = metadata.disassemble;
  if (!conf || typeof conf !== 'object') return null;
  const outputs = Array.isArray(conf.outputs) ? conf.outputs : [];
  if (!outputs.length) return null;
  return outputs
    .map((entry: any) => {
      const key = typeof entry.itemKey === 'string' ? entry.itemKey : entry.key;
      if (!key) return null;
      const min = Number(entry.min ?? entry.quantity ?? entry.qty ?? 0);
      const maxRaw = entry.max ?? entry.quantity ?? entry.qty ?? min;
      const max = Number(maxRaw);
      const chance = entry.chance !== undefined ? Number(entry.chance) : undefined;
      if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
      return { itemKey: key, min, max: Math.max(max, min), chance };
    })
    .filter(Boolean);
}

async function resolvePreview(outputs: ReturnType<typeof parseConfig>, qty: number) {
  if (!outputs) return [] as YieldPreview[];
  const previews: YieldPreview[] = [];
  for (const entry of outputs) {
    const item = await prisma.item.findUnique({ where: { key: entry.itemKey } });
    if (!item) continue;
    previews.push({
      itemKey: entry.itemKey,
      itemName: item.name,
      min: entry.min * qty,
      max: entry.max * qty,
      chance: entry.chance,
    });
  }
  return previews;
}

function formatPreview(preview: YieldPreview) {
  const range = preview.min === preview.max
    ? `${preview.min}`
    : `${preview.min} – ${preview.max}`;
  const chance = preview.chance !== undefined
    ? ` (prob. ${(Math.max(0, Math.min(1, preview.chance)) * 100).toFixed(0)}%)`
    : '';
  return `• ${preview.itemName}: ${range}${chance}`;
}

function computeRoll(entry: { min: number; max: number; chance?: number }, qty: number) {
  let total = 0;
  const min = entry.min;
  const max = entry.max;
  const chance = entry.chance !== undefined ? Math.max(0, Math.min(1, entry.chance)) : undefined;
  for (let i = 0; i < qty; i++) {
    let amount = min;
    if (max > min) {
      amount += Math.floor(Math.random() * (max - min + 1));
    }
    if (chance !== undefined) {
      if (Math.random() > chance) amount = 0;
    }
    total += amount;
  }
  return total;
}

async function autocompleteItems(userId: string, query: string) {
  const rows = await prisma.userItem.findMany({
    where: {
      userId,
      quantity: { gt: 0 },
    },
    include: { item: true },
    take: 75,
  });
  const lower = query.toLowerCase();
  return rows
    .filter(row => {
      const data: any = row.item.metadata;
      const config = parseConfig(data);
      if (!config?.length) return false;
      const key = `${row.item.name} ${row.item.key}`.toLowerCase();
      return key.includes(lower);
    })
    .slice(0, 25);
}

export default {
  data: new SlashCommandBuilder()
    .setName('disassemble')
    .setDescription('Desmonta armas o herramientas en materiales.')
    .addStringOption(option =>
      option
        .setName('item')
        .setDescription('Ítem que quieres desmontar')
        .setAutocomplete(true)
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName('cantidad')
        .setDescription('Cuántas unidades desmontar')
        .setMinValue(1)
    ),
  ns: 'disassemble',
  async execute(interaction: ChatInputCommandInteraction) {
    const userId = interaction.user.id;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      await interaction.reply({ content: 'Primero usa `/start` para crear tu perfil.', ephemeral: true });
      return;
    }

    const raw = interaction.options.getString('item', true);
    const qty = interaction.options.getInteger('cantidad') ?? 1;

    const item = await prisma.item.findFirst({
      where: {
        OR: [
          { key: { equals: raw, mode: 'insensitive' } },
          { name: { equals: raw, mode: 'insensitive' } },
        ],
      },
    });

    if (!item) {
      await interaction.reply({ content: `❌ No encontré **${raw}**.`, ephemeral: true });
      return;
    }

    const inv = await prisma.userItem.findUnique({
      where: { userId_itemId: { userId, itemId: item.id } },
    });
    if (!inv || inv.quantity <= 0) {
      await interaction.reply({ content: 'No tienes ese ítem en tu inventario.', ephemeral: true });
      return;
    }

    const config = parseConfig(item.metadata as any);
    if (!config?.length) {
      await interaction.reply({ content: 'Ese ítem no se puede desmontar.', ephemeral: true });
      return;
    }

    const amount = Math.min(qty, inv.quantity);
    const preview = await resolvePreview(config, amount);
    if (!preview.length) {
      await interaction.reply({ content: 'No hay materiales configurados para este desmontaje.', ephemeral: true });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0xe67e22)
      .setTitle(`Desmontar ${amount} × ${item.name}`)
      .setDescription('Obtendrás aproximadamente:')
      .addFields({ name: 'Materiales', value: preview.map(formatPreview).join('\n') });

    if (amount < qty) {
      embed.setFooter({ text: `Solo tienes ${inv.quantity}, se desmontarán ${amount}.` });
    }

    const confirm = new ButtonBuilder()
      .setCustomId(`disassemble:confirm:${userId}:${item.id}:${amount}`)
      .setLabel('Confirmar')
      .setStyle(ButtonStyle.Danger);

    const cancel = new ButtonBuilder()
      .setCustomId(`disassemble:cancel:${userId}`)
      .setLabel('Cancelar')
      .setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(confirm, cancel);
    await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
  },
  async autocomplete(interaction: AutocompleteInteraction) {
    const query = interaction.options.getFocused() ?? '';
    const rows = await autocompleteItems(interaction.user.id, String(query));
    const options = rows.map(row => ({
      name: `${row.item.name} (${row.quantity} disponibles)`,
      value: row.item.key,
    }));
    await interaction.respond(options);
  },
  async handleInteraction(interaction: ButtonInteraction) {
    if (!interaction.customId.startsWith('disassemble:')) return;
    const [ns, action, targetUserId, itemIdStr, qtyStr] = interaction.customId.split(':');
    if (ns !== 'disassemble') return;

    if (targetUserId !== interaction.user.id) {
      await interaction.reply({ content: 'Solo el dueño puede confirmar esta acción.', ephemeral: true });
      return;
    }

    if (action === 'cancel') {
      await interaction.update({ content: 'Desmontaje cancelado.', components: [], embeds: [] });
      return;
    }

    if (action !== 'confirm') return;

    const itemId = Number(itemIdStr);
    const qty = Number(qtyStr);
    if (!Number.isInteger(itemId) || !Number.isInteger(qty) || qty <= 0) {
      await interaction.update({ content: 'Los datos del desmontaje no son válidos.', components: [], embeds: [] });
      return;
    }

    try {
      const result = await prisma.$transaction(async (tx) => {
        const item = await tx.item.findUnique({ where: { id: itemId } });
        if (!item) throw new Error('NOT_FOUND');
        const config = parseConfig(item.metadata as any);
        if (!config?.length) throw new Error('NO_CONFIG');

        const inventory = await tx.userItem.findUnique({ where: { userId_itemId: { userId: targetUserId, itemId } } });
        if (!inventory || inventory.quantity < qty) throw new Error('NOT_ENOUGH');

        const obtained: { itemId: number; name: string; quantity: number }[] = [];
        for (const entry of config) {
          const total = computeRoll(entry, qty);
          if (total <= 0) continue;
          const mat = await tx.item.findUnique({ where: { key: entry.itemKey } });
          if (!mat) continue;
          obtained.push({ itemId: mat.id, name: mat.name, quantity: total });
        }

        if (!obtained.length) throw new Error('NO_OUTPUT');

        if (inventory.quantity === qty) {
          await tx.userItem.delete({ where: { userId_itemId: { userId: targetUserId, itemId } } });
        } else {
          await tx.userItem.update({
            where: { userId_itemId: { userId: targetUserId, itemId } },
            data: { quantity: { decrement: qty } },
          });
        }

        const totalIncoming = obtained.reduce((sum, entry) => sum + entry.quantity, 0);
        await ensureInventoryCapacity(tx, targetUserId, totalIncoming);

        for (const entry of obtained) {
          await tx.userItem.upsert({
            where: { userId_itemId: { userId: targetUserId, itemId: entry.itemId } },
            update: { quantity: { increment: entry.quantity } },
            create: { userId: targetUserId, itemId: entry.itemId, quantity: entry.quantity },
          });
        }

        return { itemName: item.name, qty, obtained };
      });

      const lines = result.obtained.map(o => `+${o.quantity} × ${o.name}`);
      const embed = new EmbedBuilder()
        .setColor(0x2ecc71)
        .setTitle(`Desmontaje completado: ${result.qty} × ${result.itemName}`)
        .setDescription(lines.join('\n'));

      await interaction.update({ embeds: [embed], components: [] });
    } catch (error: any) {
      const reason = error?.message ?? 'Error desconocido.';
      switch (reason) {
        case 'NOT_ENOUGH':
          await interaction.update({ content: 'Ya no tienes suficientes unidades.', components: [], embeds: [] });
          break;
        case 'NO_OUTPUT':
          await interaction.update({ content: 'El desmontaje no produjo materiales esta vez.', components: [], embeds: [] });
          break;
        case 'INVENTORY_FULL':
          await interaction.update({ content: 'Tu inventario está lleno para recibir los materiales.', components: [], embeds: [] });
          break;
        default:
          await interaction.update({ content: 'No se pudo completar el desmontaje.', components: [], embeds: [] });
      }
    }
  },
};
