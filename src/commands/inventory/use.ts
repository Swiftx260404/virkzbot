import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  EmbedBuilder,
} from 'discord.js';
import { EffectType, Prisma } from '@prisma/client';
import { prisma } from '../../lib/db.js';
import {
  appendBuffs,
  extractBuffState,
  StoredBuff,
} from '../../services/buffs.js';

function formatDuration(ms: number) {
  const total = Math.max(1, Math.round(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function isObject(value: Prisma.JsonValue | undefined | null): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function searchUsableItems(userId: string, query: string) {
  const rows = await prisma.userItem.findMany({
    where: {
      userId,
      quantity: { gt: 0 },
      item: { usable: true },
    },
    include: { item: { include: { effects: true } } },
    orderBy: { item: { name: 'asc' } },
    take: 50,
  });

  const lower = query.toLowerCase();
  return rows
    .filter(row => {
      const it = row.item;
      if (!it?.effects?.length) return false;
      const key = `${it.name} ${it.key}`.toLowerCase();
      return key.includes(lower);
    })
    .slice(0, 25);
}

export default {
  data: new SlashCommandBuilder()
    .setName('use')
    .setDescription('Usa un consumible o cebo para obtener un efecto temporal.')
    .addStringOption(option =>
      option
        .setName('item')
        .setDescription('Nombre o clave del ítem a usar')
        .setAutocomplete(true)
        .setRequired(true)
    ),
  ns: 'use',
  async execute(interaction: ChatInputCommandInteraction) {
    const userId = interaction.user.id;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      await interaction.reply({ content: 'Primero usa `/start` para crear tu perfil.', ephemeral: true });
      return;
    }

    const raw = interaction.options.getString('item', true);
    const item = await prisma.item.findFirst({
      where: {
        usable: true,
        OR: [
          { key: { equals: raw, mode: 'insensitive' } },
          { name: { equals: raw, mode: 'insensitive' } },
        ],
      },
      include: { effects: true },
    });

    if (!item) {
      await interaction.reply({ content: `❌ No encontré **${raw}** entre tus consumibles.`, ephemeral: true });
      return;
    }

    const inv = await prisma.userItem.findUnique({
      where: { userId_itemId: { userId, itemId: item.id } },
    });

    if (!inv || inv.quantity <= 0) {
      await interaction.reply({ content: 'No tienes unidades disponibles de ese ítem.', ephemeral: true });
      return;
    }

    if (!item.effects.length) {
      await interaction.reply({ content: 'Ese consumible no tiene efectos configurados aún.', ephemeral: true });
      return;
    }

    const now = Date.now();
    const state = extractBuffState(user.metadata, now);
    const newBuffs: StoredBuff[] = [];
    let healDelta = 0;
    let energyDelta = 0;

    for (const effect of item.effects) {
      const magnitude = Number(effect.magnitude ?? 0);
      if (effect.type === EffectType.HEAL) {
        healDelta += magnitude;
        continue;
      }
      if (effect.type === EffectType.ENERGY) {
        energyDelta += magnitude;
        continue;
      }
      if (!effect.durationSec || effect.durationSec <= 0) continue;
      const until = now + effect.durationSec * 1000;
      const meta = isObject(effect.metadata) ? effect.metadata : undefined;
      newBuffs.push({
        label: item.name,
        effect: effect.type,
        target: effect.target,
        magnitude,
        until,
        itemId: item.id,
        itemKey: item.key,
        metadata: meta,
        stacks: effect.stacks ?? undefined,
      });
    }

    if (!newBuffs.length && healDelta === 0 && energyDelta === 0) {
      await interaction.reply({ content: 'Ese consumible no tiene un efecto temporal utilizable.', ephemeral: true });
      return;
    }

    const summary: string[] = [];
    const addedBuffs = appendBuffs(state, newBuffs, now);

    if (addedBuffs.length) {
      for (const buff of addedBuffs) {
        const remaining = buff.until - now;
        const percent = Math.round(buff.magnitude * 100);
        summary.push(`🧪 **${buff.label}** — ${percent >= 0 ? `+${percent}` : percent}% por ${formatDuration(remaining)}`);
      }
    }

    if (healDelta > 0) {
      const target = Math.min(user.healthMax, user.health + healDelta);
      healDelta = target - user.health;
      if (healDelta > 0) summary.push(`❤️ Curación: +${healDelta} HP`);
    }

    if (energyDelta > 0) {
      const target = Math.min(100, user.energy + energyDelta);
      energyDelta = target - user.energy;
      if (energyDelta > 0) summary.push(`⚡ Energía: +${energyDelta}`);
    }

    await prisma.$transaction(async (tx) => {
      const inventory = await tx.userItem.findUnique({ where: { userId_itemId: { userId, itemId: item.id } } });
      if (!inventory || inventory.quantity <= 0) {
        throw new Error('NO_ITEM');
      }

      const updateData: Prisma.UserUpdateInput = {};
      if (state.changed) {
        updateData.metadata = state.root;
      }
      if (healDelta > 0) {
        updateData.health = { set: Math.min(user.healthMax, user.health + healDelta) };
      }
      if (energyDelta > 0) {
        updateData.energy = { set: Math.min(100, user.energy + energyDelta) };
      }

      if (Object.keys(updateData).length > 0) {
        await tx.user.update({ where: { id: userId }, data: updateData });
      }

      if (inventory.quantity <= 1) {
        await tx.userItem.delete({ where: { userId_itemId: { userId, itemId: item.id } } });
      } else {
        await tx.userItem.update({
          where: { userId_itemId: { userId, itemId: item.id } },
          data: { quantity: { decrement: 1 } },
        });
      }
    });
    state.changed = false;

    if (!summary.length) {
      summary.push('El efecto se ha aplicado correctamente.');
    }

    const embed = new EmbedBuilder()
      .setColor(0x3498db)
      .setTitle(`Has usado ${item.name}`)
      .setDescription(summary.join('\n'))
      .setFooter({ text: `Restante en inventario: ${inv.quantity - 1 <= 0 ? 0 : inv.quantity - 1}` });

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
  async autocomplete(interaction: AutocompleteInteraction) {
    const query = interaction.options.getFocused() ?? '';
    const rows = await searchUsableItems(interaction.user.id, String(query));
    const options = rows.map(row => ({
      name: `${row.item.name} (${row.quantity} disponibles)`,
      value: row.item.key,
    }));
    await interaction.respond(options);
  },
};
