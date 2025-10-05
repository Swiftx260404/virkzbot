import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from 'discord.js';
import { prisma } from '../../lib/db.js';
import { attackBoss, getBossWithDamage } from '../../services/boss.js';
import { useScopedCooldown } from '../../services/cooldowns.js';

const ATTACK_COOLDOWN = 30 * 60 * 1000; // 30 minutos

function formatProgress(current: number, max: number) {
  const pct = Math.max(0, Math.min(1, current / max));
  const filled = Math.round(pct * 20);
  return `HP: ${current.toLocaleString('es-ES')} / ${max.toLocaleString('es-ES')}\n[${'█'.repeat(filled)}${'░'.repeat(20 - filled)}] ${(pct * 100).toFixed(1)}%`;
}

function buildLeaderboard(rows: { userId: string; damage: number }[]) {
  if (!rows.length) return 'Nadie ha participado todavía.';
  return rows
    .map((row, idx) => {
      const tag = `<@${row.userId}>`;
      return `**${idx + 1}.** ${tag} — ${row.damage.toLocaleString('es-ES')} daño`;
    })
    .join('\n');
}

export default {
  data: new SlashCommandBuilder()
    .setName('boss')
    .setDescription('Consulta o ataca al jefe semanal.')
    .addSubcommand((sub) => sub.setName('status').setDescription('Muestra el progreso del jefe actual.'))
    .addSubcommand((sub) => sub.setName('attack').setDescription('Ataca al jefe semanal.')),
  ns: 'boss',
  async execute(interaction: ChatInputCommandInteraction) {
    const uid = interaction.user.id;
    const sub = interaction.options.getSubcommand();
    const user = await prisma.user.findUnique({ where: { id: uid } });
    if (!user) {
      return interaction.reply({ content: 'Primero usa `/start` para participar.', ephemeral: true });
    }

    if (sub === 'status') {
      const { boss, damages } = await getBossWithDamage();
      const embed = new EmbedBuilder()
        .setTitle(`Jefe semanal: ${boss.name}`)
        .setDescription(formatProgress(boss.hp, boss.maxHp))
        .addFields({ name: 'Top 10 daño', value: buildLeaderboard(damages) })
        .setColor(0xc0392b);
      return interaction.reply({ embeds: [embed] });
    }

    const cooldown = useScopedCooldown('boss-attack', uid, ATTACK_COOLDOWN);
    if (!cooldown.ok) {
      const minutes = Math.ceil(cooldown.remaining / 60000);
      return interaction.reply({ content: `Debes esperar ${minutes} minuto(s) antes de atacar de nuevo.`, ephemeral: true });
    }

    const result = await attackBoss(uid);
    const embed = new EmbedBuilder()
      .setTitle(`Ataque al jefe: ${result.boss.name}`)
      .setDescription(`Infliges ${result.damage.toLocaleString('es-ES')} daño${result.crit ? ' crítico' : ''}.\n${formatProgress(result.boss.hp, result.boss.maxHp)}`)
      .setColor(result.defeated ? 0x27ae60 : 0xe74c3c);

    if (result.defeated) {
      embed.addFields({ name: 'Estado', value: '🎉 ¡El jefe ha sido derrotado! Obtendrás recompensas al finalizar la semana.' });
    }

    const damages = await prisma.bossDamage.findMany({
      where: { bossId: result.boss.id },
      orderBy: { damage: 'desc' },
      take: 10,
    });
    embed.addFields({ name: 'Top 10 daño', value: buildLeaderboard(damages) });

    await interaction.reply({ embeds: [embed] });
  },
};
