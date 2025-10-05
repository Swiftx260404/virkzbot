import { SlashCommandBuilder, ChatInputCommandInteraction, StringSelectMenuBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { prisma } from '../../lib/db.js';
import { onCooldown } from '../../services/cooldowns.js';
import { registerSequenceSample, resetSequence } from '../../services/antiCheat.js';

export default {
  data: new SlashCommandBuilder().setName('mine').setDescription('Entrar a una mina y minar (requiere pico).'),
  ns: 'mine',
  async execute(interaction: ChatInputCommandInteraction) {
    const uid = interaction.user.id;
    const u = await prisma.user.findUnique({ where: { id: uid } });
    if (!u) return interaction.reply({ content: 'Usa `/start` primero.', ephemeral: true });
    if (!u.equippedPickaxeId) return interaction.reply({ content: 'Equipa un **pico** con `/equip`.', ephemeral: true });

    const pick = await prisma.item.findUnique({ where: { id: u.equippedPickaxeId } });
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
        const drops: string[] = meta.drop ?? ['ore_copper'];
        const multi: number = Number(meta.multi ?? 1);

        // Use pick tier to scale
        const u = await prisma.user.findUnique({ where: { id: interaction.user.id } });
        const pick = u?.equippedPickaxeId ? await prisma.item.findUnique({ where: { id: u!.equippedPickaxeId } }) : null;
        const tier = pick?.tier ?? 1;
        const totalStacks = Math.max(1, Math.floor(tier * multi));
        let lines: string[] = [];
        const ops: any[] = [];

        for (let i=0; i<totalStacks; i++) {
          const key = drops[Math.floor(Math.random()*drops.length)];
          const item = await prisma.item.findUnique({ where: { key } });
          if (!item) continue;
          const qty = 1 + Math.floor(Math.random()*tier);
          ops.push(prisma.userItem.upsert({
            where: { userId_itemId: { userId: interaction.user.id, itemId: item.id } },
            update: { quantity: { increment: qty } },
            create: { userId: interaction.user.id, itemId: item.id, quantity: qty }
          }));
          lines.push(`+${qty} × ${item.name}`);
        }
        await prisma.$transaction(ops);
        resetSequence(sequenceKey);
        return interaction.update({ content: `🪨 Recolectaste:\n` + lines.join('\n'), components: [] });
      }

      const btn = new (ButtonBuilder as any)().setCustomId(`mine:hit:${next}:${locStr}:${hitsStr}:${startStr}`).setLabel(`Golpes: ${next}/${hitsStr}`).setStyle(1);
      const row = new (ActionRowBuilder as any)().addComponents(btn);
      await interaction.update({ components: [row] });
    }
  }
}
