import { SlashCommandBuilder, ChatInputCommandInteraction, StringSelectMenuBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { prisma } from '../../lib/db.js';
import { onCooldown } from '../../services/cooldowns.js';
import { registerSequenceSample, resetSequence } from '../../services/antiCheat.js';
import { extractBuffState, sumBuffs, buffAppliesTo } from '../../services/buffs.js';
import type { ActiveBuff } from '../../services/buffs.js';
import { EffectType } from '@prisma/client';
import { getGuildBonusesForUser } from '../../services/guilds.js';
import { ensureInventoryCapacity } from '../../services/inventory.js';
import { getPetBonuses } from '../../services/pets.js';

type DropConfig = {
  itemKey: string;
  weight: number;
  min: number;
  max: number;
};

const randomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

const parseDrops = (meta: any): DropConfig[] => {
  if (!meta || !Array.isArray(meta.drops)) return [];
  return meta.drops.map((entry: any) => ({
    itemKey: String(entry.itemKey ?? 'fish_riverling'),
    weight: Number(entry.weight ?? 1),
    min: Number(entry.quantity?.min ?? 1),
    max: Number(entry.quantity?.max ?? entry.quantity?.min ?? 1),
  }));
};

const pickDrop = (drops: DropConfig[]) => {
  const total = drops.reduce((sum, d) => sum + Math.max(0, d.weight), 0);
  if (!total) return drops[0];
  let roll = Math.random() * total;
  for (const d of drops) {
    roll -= Math.max(0, d.weight);
    if (roll <= 0) return d;
  }
  return drops[drops.length - 1];
};

const formatZoneEmbed = async (rodTier: number) => {
  const locations = await prisma.location.findMany({
    where: { kind: 'FISHING' },
    orderBy: [{ requiredTier: 'asc' }, { name: 'asc' }],
  });

  if (!locations.length) {
    return new EmbedBuilder().setTitle('🎣 Zonas de pesca').setDescription('No hay zonas configuradas.').setColor(0x2e9aff);
  }

  const embed = new EmbedBuilder()
    .setTitle('🎣 Zonas de pesca')
    .setColor(0x2e9aff)
    .setFooter({ text: 'Usa /fish start para intentar capturar en la zona que prefieras.' });

  for (const loc of locations) {
    const meta = (loc.metadata ?? {}) as any;
    const emoji: string = typeof meta.emoji === 'string' ? meta.emoji : '🎣';
    const xp = meta.xpRange ? `${meta.xpRange.min ?? 0}–${meta.xpRange.max ?? 0}` : '—';
    const yieldMultiplier = Number(meta.yieldMultiplier ?? 1).toFixed(2);
    const drops = parseDrops(meta);
    const dropKeys = drops.map(d => d.itemKey);
    const items = dropKeys.length
      ? await prisma.item.findMany({ where: { key: { in: dropKeys } }, select: { key: true, name: true } })
      : [];
    const nameMap = new Map(items.map(i => [i.key, i.name] as const));
    const totalWeight = drops.reduce((sum, d) => sum + Math.max(0, d.weight), 0) || 1;
    const dropLines = drops.slice(0, 4).map(d => {
      const pct = Math.round((Math.max(0, d.weight) / totalWeight) * 100);
      const name = nameMap.get(d.itemKey) ?? d.itemKey;
      return `• ${name} (${pct}% · ${d.min}-${d.max})`;
    }).join('\n') || '• Capturas comunes';
    const locked = rodTier < loc.requiredTier;
    const title = `${locked ? '🔒' : '✅'} T${loc.requiredTier} · ${emoji} ${loc.name}`;
    const descParts = [meta.description ?? 'Zona de pesca.'];
    descParts.push(`**XP:** ${xp} · **Rendimiento:** ×${yieldMultiplier}`);
    descParts.push(dropLines);
    embed.addFields({ name: title, value: descParts.join('\n') });
  }

  return embed;
};

export default {
  data: new SlashCommandBuilder()
    .setName('fish')
    .setDescription('Gestiona tus sesiones de pesca.')
    .addSubcommand(sub => sub.setName('start').setDescription('Ir a pescar (requiere caña equipada).'))
    .addSubcommand(sub => sub.setName('zones').setDescription('Ver las zonas de pesca y sus recompensas.')),
  ns: 'fish',
  async execute(interaction: ChatInputCommandInteraction) {
    const uid = interaction.user.id;
    const u = await prisma.user.findUnique({ where: { id: uid } });
    if (!u) return interaction.reply({ content: 'Usa `/start` primero.', ephemeral: true });
    if (!u.equippedRodId) return interaction.reply({ content: 'Equipa una **caña** con `/equip`.', ephemeral: true });

    const rod = await prisma.item.findUnique({ where: { id: u.equippedRodId } });
    const sub = interaction.options.getSubcommand(false) ?? 'start';

    if (sub === 'zones') {
      const embed = await formatZoneEmbed(rod?.tier ?? 1);
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const locs = await prisma.location.findMany({ where: { kind: 'FISHING', requiredTier: { lte: rod?.tier ?? 0 } } });
    if (!locs.length) return interaction.reply({ content: 'Tu caña es demasiado básica. Compra una mejor en `/shop`.', ephemeral: true });

    const menu = new StringSelectMenuBuilder()
      .setCustomId('fish:loc')
      .setPlaceholder('Elige una zona de pesca')
      .addOptions(locs.map(l => ({ label: l.name, value: String(l.id), description: `Req T${l.requiredTier}` })).slice(0,25));
    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
    await interaction.reply({ content: `🎣 Tu caña: T${rod?.tier} — Elige zona:`, components: [row] });
  },
  async handleInteraction(interaction: any) {
    if (interaction.isStringSelectMenu() && interaction.customId === 'fish:loc') {
      const locId = Number(interaction.values[0]);
      const uid = interaction.user.id;
      const cd = onCooldown(`fish:${uid}`, 20_000);
      if (!cd.ok) return interaction.update({ content: `⏳ Cooldown: ${(cd.remaining/1000).toFixed(0)}s`, components: [] });

      // Start tension mini-game: need to click "Reel in" ~6-9 times within 12s
      const pulls = 6 + Math.floor(Math.random()*4);
      const btn = new ButtonBuilder().setCustomId(`fish:reel:0:${locId}:${pulls}:${Date.now()}`).setLabel('🎣 Recoger Sedal').setStyle(ButtonStyle.Primary);
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(btn);
      await interaction.update({ content: `La boya se mueve... ¡Recoge **${pulls}** veces en 12s!`, components: [row] });
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('fish:reel:')) {
      const [ , , countStr, locStr, pullsStr, startStr ] = interaction.customId.split(':');
      const count = Number(countStr);
      const pulls = Number(pullsStr);
      const start = Number(startStr);
      const now = Date.now();
      if (now - start > 12_000) {
        resetSequence(`fish:${interaction.user.id}:${start}`);
        return interaction.update({ content: '🐟 Se escapó el pez...', components: [] });
      }

      const next = count + 1;
      const sequenceKey = `fish:${interaction.user.id}:${start}`;
      const check = registerSequenceSample({ key: sequenceKey, start, windowMs: 12_000, timestamp: now });
      if (!check.ok) {
        resetSequence(sequenceKey);
        return interaction.update({ content: `🚫 ${check.reason ?? 'Detección anti-macro.'}`, components: [] });
      }
      if (next >= pulls) {
        const locId = Number(locStr);
        const loc = await prisma.location.findUnique({ where: { id: locId } });
        const meta = (loc?.metadata || {}) as any;
        const drops = parseDrops(meta);
        const yieldMultiplier: number = Number(meta.yieldMultiplier ?? 1);

        const user = await prisma.user.findUnique({ where: { id: interaction.user.id } });
        let buffs: ActiveBuff[] = [];
        if (user) {
          const state = extractBuffState(user.metadata);
          buffs = state.active;
          if (state.changed) {
            await prisma.user.update({ where: { id: user.id }, data: { metadata: state.root } });
          }
        }
        const appliesFish = (buff: ActiveBuff) => buffAppliesTo(buff, 'FISH') || buffAppliesTo(buff, 'ROD');
        const buffDropBonus = sumBuffs(buffs, EffectType.BUFF_DROP_RATE, appliesFish);
        const buffYieldBonus = sumBuffs(buffs, EffectType.BUFF_RESOURCE_YIELD, appliesFish);
        const buffLuckBonus = sumBuffs(buffs, EffectType.BUFF_LUCK, appliesFish);
        const guildBonuses = await getGuildBonusesForUser(interaction.user.id);
        const petBonuses = await getPetBonuses(interaction.user.id);
        const petDropBonus = petBonuses?.dropRate ?? 0;
        const petYieldBonus = petBonuses?.resourceYield ?? 0;
        const petLuckBonus = petBonuses?.luck ?? 0;
        const dropBonus = buffDropBonus + guildBonuses.dropRate + petDropBonus;
        const yieldBonus = buffYieldBonus + petYieldBonus;
        const luckBonus = buffLuckBonus + petLuckBonus;

        const baseStacks = Math.max(1, Math.round(Number(meta.baseStacks ?? 1) || 1));
        let stacks = baseStacks;
        if (dropBonus > 0) {
          const extra = baseStacks * dropBonus;
          stacks += Math.floor(extra);
          if (Math.random() < extra - Math.floor(extra)) stacks += 1;
        }
        if (luckBonus > 0) {
          stacks += Math.floor(luckBonus);
          if (Math.random() < luckBonus - Math.floor(luckBonus)) stacks += 1;
        }

        const lines: string[] = [];
        const rewardMap = new Map<number, { itemId: number; name: string; quantity: number }>();

        for (let i = 0; i < stacks; i++) {
          const choice = drops.length ? pickDrop(drops) : { itemKey: 'fish_riverling', min: 1, max: 2 };
          const item = await prisma.item.findUnique({ where: { key: choice.itemKey } });
          if (!item) continue;
          let qty = randomInt(choice.min, choice.max);
          if (yieldBonus > 0) {
            const scaled = qty * (1 + yieldBonus);
            qty = Math.max(choice.min, Math.round(scaled));
          }
          if (yieldMultiplier > 1) {
            qty = Math.max(choice.min, Math.round(qty * yieldMultiplier));
          }
          const current = rewardMap.get(item.id) ?? { itemId: item.id, name: item.name, quantity: 0 };
          current.quantity += qty;
          rewardMap.set(item.id, current);
          lines.push(`+${qty} × ${item.name}`);
        }

        if (!rewardMap.size) {
          resetSequence(sequenceKey);
          return interaction.update({ content: 'Nada mordió el anzuelo...', components: [] });
        }

        const totalAwarded = Array.from(rewardMap.values()).reduce((sum, entry) => sum + entry.quantity, 0);
        await prisma.$transaction(async (tx) => {
          await ensureInventoryCapacity(tx, interaction.user.id, totalAwarded);
          for (const entry of rewardMap.values()) {
            await tx.userItem.upsert({
              where: { userId_itemId: { userId: interaction.user.id, itemId: entry.itemId } },
              update: { quantity: { increment: entry.quantity } },
              create: { userId: interaction.user.id, itemId: entry.itemId, quantity: entry.quantity }
            });
          }
        });
        if (loc && meta?.xpRange) {
          const minXp = Number(meta.xpRange.min ?? 0);
          const maxXp = Number(meta.xpRange.max ?? minXp);
          if (!Number.isNaN(minXp) && !Number.isNaN(maxXp) && maxXp >= 0) {
            const xpGained = randomInt(Math.max(0, minXp), Math.max(0, maxXp));
            if (xpGained > 0) {
              await prisma.user.update({ where: { id: interaction.user.id }, data: { xp: { increment: xpGained } } });
              lines.push(`✨ ${xpGained} XP de pesca`);
            }
          }
        }
        resetSequence(sequenceKey);
        if (dropBonus > 0 || yieldBonus > 0 || luckBonus > 0 || guildBonuses.dropRate > 0 || petDropBonus > 0 || petYieldBonus > 0 || petLuckBonus > 0) {
          const parts: string[] = [];
          if (buffDropBonus > 0) parts.push(`buff drop +${Math.round(buffDropBonus * 100)}%`);
          if (guildBonuses.dropRate > 0) parts.push(`gremio drop +${Math.round(guildBonuses.dropRate * 100)}%`);
          if (petDropBonus > 0) parts.push(`mascota drop +${Math.round(petDropBonus * 100)}%`);
          if (yieldBonus > 0) parts.push(`rendimiento +${Math.round(yieldBonus * 100)}%`);
          if (luckBonus > 0) parts.push(`suerte +${Math.round(luckBonus * 100)}%`);
          parts.push(`🎣 Lances: ${stacks}`);
          lines.push(`🔸 Multiplicadores: ${parts.join(' · ')}`);
        }
        return interaction.update({ content: `🐠 ¡Pescaste!\n${lines.join('\n')}`, components: [] });
      }

      const btn = new (ButtonBuilder as any)().setCustomId(`fish:reel:${next}:${locStr}:${pullsStr}:${startStr}`).setLabel(`Recoger ${next}/${pullsStr}`).setStyle(1);
      const row = new (ActionRowBuilder as any)().addComponents(btn);
      await interaction.update({ components: [row] });
    }
  }
}
