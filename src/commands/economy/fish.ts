import { SlashCommandBuilder, ChatInputCommandInteraction, StringSelectMenuBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { prisma } from '../../lib/db.js';
import { onCooldown } from '../../services/cooldowns.js';
import { registerSequenceSample, resetSequence } from '../../services/antiCheat.js';

export default {
  data: new SlashCommandBuilder().setName('fish').setDescription('Ir a pescar (requiere caña).'),
  ns: 'fish',
  async execute(interaction: ChatInputCommandInteraction) {
    const uid = interaction.user.id;
    const u = await prisma.user.findUnique({ where: { id: uid } });
    if (!u) return interaction.reply({ content: 'Usa `/start` primero.', ephemeral: true });
    if (!u.equippedRodId) return interaction.reply({ content: 'Equipa una **caña** con `/equip`.', ephemeral: true });

    const rod = await prisma.item.findUnique({ where: { id: u.equippedRodId } });
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
        const drops: string[] = meta.drop ?? ['fish_common'];
        const multi: number = Number(meta.multi ?? 1);
        const key = drops[Math.floor(Math.random()*drops.length)];
        const item = await prisma.item.findUnique({ where: { key } });
        if (item) {
          const qty = 1 + Math.floor(Math.random()*multi);
          await prisma.userItem.upsert({
            where: { userId_itemId: { userId: interaction.user.id, itemId: item.id } },
            update: { quantity: { increment: qty } },
            create: { userId: interaction.user.id, itemId: item.id, quantity: qty }
          });
          resetSequence(sequenceKey);
          return interaction.update({ content: `🐠 ¡Pescaste **${qty} × ${item.name}**!`, components: [] });
        } else {
          resetSequence(sequenceKey);
          return interaction.update({ content: 'Nada mordió el anzuelo...', components: [] });
        }
      }

      const btn = new (ButtonBuilder as any)().setCustomId(`fish:reel:${next}:${locStr}:${pullsStr}:${startStr}`).setLabel(`Recoger ${next}/${pullsStr}`).setStyle(1);
      const row = new (ActionRowBuilder as any)().addComponents(btn);
      await interaction.update({ components: [row] });
    }
  }
}
