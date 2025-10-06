import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from 'discord.js';
import {
  findTemplate,
  getCurrentEvents,
  getEventCalendar,
  getUpcomingOccurrences,
} from '../../services/eventScheduler.js';
import { getGlobalModifierSnapshot } from '../../services/globalEvents.js';

function summarizeBonuses(bonuses: Record<string, any> | undefined | null) {
  if (!bonuses || typeof bonuses !== 'object') return '—';
  const lines: string[] = [];
  if (bonuses.economy?.multiplier) {
    const cmds = Array.isArray(bonuses.economy.commands) && bonuses.economy.commands.length
      ? ` (${bonuses.economy.commands.join(', ')})`
      : '';
    lines.push(`• Economía ×${Number(bonuses.economy.multiplier).toFixed(2)}${cmds}`);
  }
  if (bonuses.drop?.multiplier) {
    const tags = Array.isArray(bonuses.drop.tags) && bonuses.drop.tags.length ? ` [${bonuses.drop.tags.join(', ')}]` : '';
    lines.push(`• Drops ×${Number(bonuses.drop.multiplier).toFixed(2)}${tags}`);
  }
  if (bonuses.xp?.multiplier) {
    lines.push(`• XP ×${Number(bonuses.xp.multiplier).toFixed(2)}`);
  }
  if (bonuses.fishing?.multiplier) {
    lines.push(`• Pesca ×${Number(bonuses.fishing.multiplier).toFixed(2)}`);
  }
  if (bonuses.craft?.costMultiplier || bonuses.craft?.qualityMultiplier) {
    const parts: string[] = [];
    if (bonuses.craft.costMultiplier) parts.push(`costos ×${Number(bonuses.craft.costMultiplier).toFixed(2)}`);
    if (bonuses.craft.qualityMultiplier) parts.push(`calidad ×${Number(bonuses.craft.qualityMultiplier).toFixed(2)}`);
    lines.push(`• Forja ${parts.join(' · ')}`.trim());
  }
  if (bonuses.boss?.spawn) {
    lines.push(`• Jefe especial: ${bonuses.boss.spawn}`);
  }
  if (bonuses.adventure?.rewardMultiplier || bonuses.adventure?.riskMultiplier) {
    const reward = bonuses.adventure.rewardMultiplier
      ? `recompensa ×${Number(bonuses.adventure.rewardMultiplier).toFixed(2)}`
      : null;
    const risk = bonuses.adventure.riskMultiplier
      ? `riesgo ×${Number(bonuses.adventure.riskMultiplier).toFixed(2)}`
      : null;
    lines.push(`• Aventuras ${[risk, reward].filter(Boolean).join(' · ')}`);
  }
  if (!lines.length) return 'Bonos misteriosos activos';
  return lines.join('\n');
}

function summarizeDrops(drops: any) {
  if (!Array.isArray(drops) || drops.length === 0) return '—';
  return drops
    .slice(0, 6)
    .map((drop: any) => {
      const qtyMin = Number(drop.qtyMin ?? drop.quantity?.min ?? 1);
      const qtyMax = Number(drop.qtyMax ?? drop.quantity?.max ?? qtyMin ?? 1);
      const commands = Array.isArray(drop.commands) && drop.commands.length
        ? ` · cmds: ${drop.commands.join(', ')}`
        : '';
      const chance = Number(drop.chance ?? 0) * 100;
      return `• ${drop.itemKey ?? 'item'} (${chance.toFixed(0)}% · ${qtyMin}-${qtyMax}${commands})`;
    })
    .join('\n');
}

export default {
  data: new SlashCommandBuilder()
    .setName('event')
    .setDescription('Consulta el calendario global de eventos.')
    .addSubcommand((sub) => sub.setName('current').setDescription('Muestra los eventos activos ahora mismo.'))
    .addSubcommand((sub) => sub.setName('list').setDescription('Lista los próximos eventos programados.'))
    .addSubcommand((sub) =>
      sub
        .setName('info')
        .setDescription('Detalles de un evento específico.')
        .addStringOption((opt) =>
          opt
            .setName('nombre')
            .setDescription('Nombre o clave del evento.')
            .setRequired(true)
        )
    ),
  ns: 'event',
  async execute(interaction: ChatInputCommandInteraction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'current') {
      const activeEvents = await getCurrentEvents();
      if (!activeEvents.length) {
        return interaction.reply({ content: 'No hay eventos globales activos en este momento.', ephemeral: true });
      }
      const snapshot = await getGlobalModifierSnapshot();
      const embed = new EmbedBuilder().setTitle('🎊 Eventos activos').setColor(0xf39c12);
      for (const evt of activeEvents) {
        const bonuses = summarizeBonuses(evt.bonuses as Record<string, any> | undefined);
        const startTs = Math.floor(evt.startDate.getTime() / 1000);
        const endTs = Math.floor(evt.endDate.getTime() / 1000);
        embed.addFields({
          name: evt.name,
          value: `${evt.description}\n${bonuses}\nTermina <t:${endTs}:R> (<t:${endTs}:f>)`,
        });
      }
      embed.setFooter({ text: `Última sincronización: ${snapshot.updatedAt}` });
      return interaction.reply({ embeds: [embed] });
    }

    if (sub === 'list') {
      const upcoming = await getUpcomingOccurrences(10);
      if (!upcoming.length) {
        return interaction.reply({ content: 'No hay eventos programados en el calendario.', ephemeral: true });
      }
      const embed = new EmbedBuilder().setTitle('📅 Próximos eventos').setColor(0x1abc9c);
      for (const occ of upcoming.slice(0, 10)) {
        const startTs = Math.floor(occ.start.getTime() / 1000);
        const endTs = Math.floor(occ.end.getTime() / 1000);
        const bonuses = summarizeBonuses(occ.template.bonuses as Record<string, any> | undefined);
        embed.addFields({
          name: occ.template.name,
          value: `${occ.template.description}\n${bonuses}\nInicio: <t:${startTs}:f> · Termina: <t:${endTs}:f>`,
        });
      }
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (sub === 'info') {
      const term = interaction.options.getString('nombre', true);
      const template = await findTemplate(term);
      if (!template) {
        return interaction.reply({ content: `No encontré un evento llamado **${term}**.`, ephemeral: true });
      }
      const calendar = await getEventCalendar();
      const related = calendar.filter((entry) => entry.templateKey === template.key);
      const upcoming = (await getUpcomingOccurrences(10)).filter((occ) => occ.template.key === template.key).slice(0, 3);
      const activeEvents = await getCurrentEvents();
      const active = activeEvents.find((evt) => evt.templateKey === template.key) ?? null;

      const embed = new EmbedBuilder()
        .setTitle(`ℹ️ ${template.name}`)
        .setDescription(template.description)
        .setColor(active ? 0xe74c3c : 0x2980b9)
        .addFields(
          { name: 'Bonos', value: summarizeBonuses(template.bonuses as Record<string, any> | undefined) },
          { name: 'Drops especiales', value: summarizeDrops(template.drops) }
        );

      if (active) {
        const endTs = Math.floor(active.endDate.getTime() / 1000);
        embed.addFields({ name: 'Estado', value: `🟢 Activo hasta <t:${endTs}:R>` });
      } else {
        embed.addFields({ name: 'Estado', value: '⚪ Inactivo actualmente' });
      }

      if (upcoming.length) {
        const schedule = upcoming
          .map((occ) => `• <t:${Math.floor(occ.start.getTime() / 1000)}:f> → <t:${Math.floor(occ.end.getTime() / 1000)}:f>`)
          .join('\n');
        embed.addFields({ name: 'Próximas apariciones', value: schedule });
      }

      if (related.length) {
        const scheduleMode = related
          .map((entry) => {
            if (entry.rrule) {
              return `RRULE: ${entry.rrule}`;
            }
            if (entry.startISO && entry.endISO) {
              return `${entry.startISO} → ${entry.endISO}`;
            }
            if (entry.startISO) {
              const duration = entry.durationHours ? `${entry.durationHours}h` : 'duración predeterminada';
              return `${entry.startISO} (+${duration})`;
            }
            return 'Entrada personalizada';
          })
          .join('\n');
        embed.addFields({ name: 'Programación', value: scheduleMode });
      }

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
  },
};
