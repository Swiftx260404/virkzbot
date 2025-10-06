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
    itemKey: String(entry.itemKey ?? 'ore_copper'),
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

const formatZoneEmbed = async (pickTier: number) => {
  const locations = await prisma.location.findMany({
    where: { kind: 'MINE' },
    orderBy: [{ requiredTier: 'asc' }, { name: 'asc' }],
  });

  if (!locations.length) {
    return new EmbedBuilder().setTitle('⛏️ Minas disponibles').setDescription('No hay minas configuradas.').setColor(0x6f4cff);
  }

  const embed = new EmbedBuilder()
    .setTitle('⛏️ Minas disponibles')
    .setColor(0x6f4cff)
    .setFooter({ text: 'Elige una zona con /mine start y completa el minijuego para recibir recompensas.' });

  for (const loc of locations) {
    const meta = (loc.metadata ?? {}) as any;
    const emoji: string = typeof meta.emoji === 'string' ? meta.emoji : '⛏️';
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
    }).join('\n') || '• Recursos comunes';
    const locked = pickTier < loc.requiredTier;
    const title = `${locked ? '🔒' : '✅'} T${loc.requiredTier} · ${emoji} ${loc.name}`;
    const descParts = [meta.description ?? 'Exploración minera.'];
    descParts.push(`**XP:** ${xp} · **Rendimiento:** ×${yieldMultiplier}`);
    descParts.push(dropLines);
    embed.addFields({ name: title, value: descParts.join('\n') });
  }

  return embed;
};

export default {
  data: new SlashCommandBuilder()
    .setName('mine')
    .setDescription('Gestiona tus expediciones mineras.')
    .addSubcommand(sub =>
      sub.setName('start').setDescription('Entrar a una mina y minar (requiere pico equipado).'))
    .addSubcommand(sub =>
      sub.setName('zones').setDescription('Ver las zonas mineras disponibles y sus recompensas.')),
  ns: 'mine',
  async execute(interaction: ChatInputCommandInteraction) {
    const uid = interaction.user.id;
    const u = await prisma.user.findUnique({ where: { id: uid } });
    if (!u) return interaction.reply({ content: 'Usa `/start` primero.', ephemeral: true });
    if (!u.equippedPickaxeId) return interaction.reply({ content: 'Equipa un **pico** con `/equip`.', ephemeral: true });

    const pick = await prisma.item.findUnique({ where: { id: u.equippedPickaxeId } });
    const sub = interaction.options.getSubcommand(false) ?? 'start';

    if (sub === 'zones') {
      const embed = await formatZoneEmbed(pick?.tier ?? 1);
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const locs = await prisma.location.findMany({ where: { kind: 'MINE', requiredTier: { lte: pick?.tier ?? 0 } } });
    if (!locs.length) return interaction.reply({ content: 'Tu pico es demasiado básico. Compra uno mejor en `/shop`.', ephemeral: true });

    const menu = new StringSelectMenuBuilder()
      .setCustomId('mine:loc')
      .setPlaceholder('Elige una mina')
      .addOptions(locs.map(l => ({ label: l.name, value: String(l.id), description: `Req T${l.requiredTier}` })).slice(0,25));
    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
    await interaction.reply({ content: `⛏️ Tu pico: T${pick?.tier} — Elige mina:`, components: [row] });
  },
  async handleInteraction(interaction: any) {
    if (interaction.isStringSelectMenu() && interaction.customId === 'mine:loc') {
      const locId = Number(interaction.values[0]);
      const uid = interaction.user.id;
      const cd = onCooldown(`mine:${uid}`, 20_000);
      if (!cd.ok) return interaction.update({ content: `⏳ Cooldown: ${(cd.remaining/1000).toFixed(0)}s`, components: [] });

      // Start minigame: 5-10 hits allowed based on pick tier
      const u = await prisma.user.findUnique({ where: { id: uid } });
      const pick = u?.equippedPickaxeId ? await prisma.item.findUnique({ where: { id: u!.equippedPickaxeId } }) : null;
      const hits = Math.min(10, 4 + (pick?.tier ?? 1) * 2);
      const btn = new ButtonBuilder().setCustomId(`mine:hit:0:${locId}:${hits}:${Date.now()}`).setLabel('⛏️ Golpear').setStyle(ButtonStyle.Primary);
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(btn);
      await interaction.update({ content: `Mina seleccionada. Golpea la roca **${hits}** veces en 12s.`, components: [row] });
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('mine:hit:')) {
      const [ , , countStr, locStr, hitsStr, startStr ] = interaction.customId.split(':');
      const count = Number(countStr);
      const targetHits = Number(hitsStr);
      const start = Number(startStr);
      const now = Date.now();
      if (now - start > 12_000) {
        resetSequence(`mine:${interaction.user.id}:${start}`);
        return interaction.update({ content: '⏱️ La veta colapsó. Vuelve a intentarlo más tarde.', components: [] });
      }

      const next = count + 1;
      const sequenceKey = `mine:${interaction.user.id}:${start}`;
      const check = registerSequenceSample({ key: sequenceKey, start, windowMs: 12_000, timestamp: now });
      if (!check.ok) {
        resetSequence(sequenceKey);
        return interaction.update({ content: `🚫 ${check.reason ?? 'Detección anti-macro.'}`, components: [] });
      }
      if (next >= targetHits) {
        // compute reward based on location drops and pick tier
        const locId = Number(locStr);
        const loc = await prisma.location.findUnique({ where: { id: locId } });
        const meta = (loc?.metadata || {}) as any;
        const drops = parseDrops(meta);
        const yieldMultiplier: number = Number(meta.yieldMultiplier ?? 1);

        // Use pick tier to scale
        const u = await prisma.user.findUnique({ where: { id: interaction.user.id } });
        const pick = u?.equippedPickaxeId ? await prisma.item.findUnique({ where: { id: u!.equippedPickaxeId } }) : null;
        let buffs: ActiveBuff[] = [];
        if (u) {
          const state = extractBuffState(u.metadata);
          buffs = state.active;
          if (state.changed) {
            await prisma.user.update({ where: { id: u.id }, data: { metadata: state.root } });
          }
        }
        const appliesMine = (buff: ActiveBuff) => buffAppliesTo(buff, 'MINE') || buffAppliesTo(buff, 'PICKAXE');
        const buffDropBonus = sumBuffs(buffs, EffectType.BUFF_DROP_RATE, appliesMine);
        const buffYieldBonus = sumBuffs(buffs, EffectType.BUFF_RESOURCE_YIELD, appliesMine);
        const buffLuckBonus = sumBuffs(buffs, EffectType.BUFF_LUCK, appliesMine);
        const guildBonuses = await getGuildBonusesForUser(interaction.user.id);
        const petBonuses = await getPetBonuses(interaction.user.id);
        const petDropBonus = petBonuses?.dropRate ?? 0;
        const petYieldBonus = petBonuses?.resourceYield ?? 0;
        const petLuckBonus = petBonuses?.luck ?? 0;
        const dropBonus = buffDropBonus + guildBonuses.dropRate + petDropBonus;
        const yieldBonus = buffYieldBonus + petYieldBonus;
        const luckBonus = buffLuckBonus + petLuckBonus;
        const tier = pick?.tier ?? 1;
        const baseStacks = Math.max(1, Math.round((tier || 1) * yieldMultiplier));
        let totalStacks = baseStacks;
        if (dropBonus > 0) {
          const extra = baseStacks * dropBonus;
          totalStacks += Math.floor(extra);
          if (Math.random() < extra - Math.floor(extra)) totalStacks += 1;
        }
        if (luckBonus > 0) {
          totalStacks += Math.floor(luckBonus);
          if (Math.random() < luckBonus - Math.floor(luckBonus)) totalStacks += 1;
        }
        const lines: string[] = [];
        const rewardMap = new Map<number, { itemId: number; name: string; quantity: number }>();

        for (let i = 0; i < totalStacks; i++) {
          const choice = drops.length ? pickDrop(drops) : { itemKey: 'ore_copper', min: 1, max: Math.max(1, tier) };
          const item = await prisma.item.findUnique({ where: { key: choice.itemKey } });
          if (!item) continue;
          let qty = randomInt(choice.min, choice.max);
          if (yieldBonus > 0) {
            const scaled = qty * (1 + yieldBonus);
            qty = Math.max(choice.min, Math.round(scaled));
          }
          const current = rewardMap.get(item.id) ?? { itemId: item.id, name: item.name, quantity: 0 };
          current.quantity += qty;
          rewardMap.set(item.id, current);
          lines.push(`+${qty} × ${item.name}`);
        }

        const totalAwarded = Array.from(rewardMap.values()).reduce((sum, entry) => sum + entry.quantity, 0);
        if (totalAwarded > 0) {
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
        }

        if (loc && meta?.xpRange) {
          const minXp = Number(meta.xpRange.min ?? 0);
          const maxXp = Number(meta.xpRange.max ?? minXp);
          if (!Number.isNaN(minXp) && !Number.isNaN(maxXp) && maxXp >= 0) {
            const xpGained = randomInt(Math.max(0, minXp), Math.max(0, maxXp));
            if (xpGained > 0) {
              await prisma.user.update({ where: { id: interaction.user.id }, data: { xp: { increment: xpGained } } });
              lines.push(`✨ ${xpGained} XP minero`);
            }
          }
        }

        resetSequence(sequenceKey);
        if (dropBonus > 0 || yieldBonus > 0 || luckBonus > 0 || guildBonuses.dropRate > 0 || petDropBonus > 0 || petYieldBonus > 0 || petLuckBonus > 0) {
          const bonusParts: string[] = [];
          if (buffDropBonus > 0) bonusParts.push(`buff drop +${Math.round(buffDropBonus * 100)}%`);
          if (guildBonuses.dropRate > 0) bonusParts.push(`gremio drop +${Math.round(guildBonuses.dropRate * 100)}%`);
          if (petDropBonus > 0) bonusParts.push(`mascota drop +${Math.round(petDropBonus * 100)}%`);
          if (yieldBonus > 0) bonusParts.push(`rendimiento +${Math.round(yieldBonus * 100)}%`);
          if (luckBonus > 0) bonusParts.push(`suerte +${Math.round(luckBonus * 100)}%`);
          lines.push(`🔸 Buffs activos: ${bonusParts.join(' · ')}`);
        }
        return interaction.update({ content: `🪨 Recolectaste:\n` + lines.join('\n'), components: [] });
      }

      const btn = new (ButtonBuilder as any)().setCustomId(`mine:hit:${next}:${locStr}:${hitsStr}:${startStr}`).setLabel(`Golpes: ${next}/${hitsStr}`).setStyle(1);
      const row = new (ActionRowBuilder as any)().addComponents(btn);
      await interaction.update({ components: [row] });
    }
  }
}
