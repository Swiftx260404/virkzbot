import { SlashCommandBuilder, ChatInputCommandInteraction, ButtonBuilder, ButtonStyle, ActionRowBuilder } from 'discord.js';
import { onCooldown } from '../../services/cooldowns.js';
import { prisma } from '../../lib/db.js';
import { registerSequenceSample, resetSequence } from '../../services/antiCheat.js';

export default {
  data: new SlashCommandBuilder().setName('work').setDescription('Trabaja en un minijuego corto para ganar V Coins.'),
  ns: 'work',
  async execute(interaction: ChatInputCommandInteraction) {
    const uid = interaction.user.id;
    const cd = onCooldown(`work:${uid}`, 60_000);
    if (!cd.ok) return interaction.reply({ content: `⏳ Aún en cooldown. Espera ${(cd.remaining/1000).toFixed(0)}s.`, ephemeral: true });

    // 10 segundos para hacer 8-12 clicks humanos
    const target = 8 + Math.floor(Math.random()*5);
    const btn = new ButtonBuilder().setCustomId(`work:click:0:${Date.now()}:${target}`).setLabel('⬆️ Trabajar').setStyle(ButtonStyle.Success);
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(btn);
    await interaction.reply({ content: `Pulsa el botón **${target} veces** en 10 segundos (no demasiado rápido ni perfecto).`, components: [row] });
  },
  async handleInteraction(interaction: any) {
    if (!interaction.isButton()) return;
    const [ns, action, countStr, startStr, targetStr] = interaction.customId.split(':'); // work:click:count:start:target
    if (ns !== 'work' || action !== 'click') return;

    const count = Number(countStr);
    const start = Number(startStr);
    const target = Number(targetStr);
    const now = Date.now();
    const elapsed = now - start;
    if (elapsed > 10_000) {
      resetSequence(`work:${interaction.user.id}:${start}`);
      return interaction.update({ content: '⏱️ Tiempo agotado.', components: [] });
    }

    const nextCount = count + 1;
    const remain = target - nextCount;

    if (nextCount >= target) {
      const sequenceKey = `work:${interaction.user.id}:${start}`;
      const check = registerSequenceSample({ key: sequenceKey, start, windowMs: 10_000, timestamp: now });
      if (!check.ok) {
        resetSequence(sequenceKey);
        return interaction.update({ content: `🚫 ${check.reason ?? 'Detección anti-macro.'}`, components: [] });
      }

      const reward = 25 + Math.floor(Math.random()*20);
      await prisma.user.update({ where: { id: interaction.user.id }, data: { vcoins: { increment: reward } } });
      resetSequence(sequenceKey);
      return interaction.update({ content: `💼 ¡Buen trabajo! Ganaste **${reward} V Coins**.`, components: [] });
    }

    const sequenceKey = `work:${interaction.user.id}:${start}`;
    const check = registerSequenceSample({ key: sequenceKey, start, windowMs: 10_000, timestamp: now });
    if (!check.ok) {
      resetSequence(sequenceKey);
      return interaction.update({ content: `🚫 ${check.reason ?? 'Detección anti-macro.'}`, components: [] });
    }

    const btn = new (ButtonBuilder as any)().setCustomId(`work:click:${nextCount}:${start}:${target}`).setLabel(`Clicks restantes: ${Math.max(0, remain)}`).setStyle(3);
    const row = new (ActionRowBuilder as any)().addComponents(btn);
    await interaction.update({ components: [row] });
  }
}
