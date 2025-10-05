import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from 'discord.js';
import { prisma } from '../../lib/db.js';
import { extractBuffState } from '../../services/buffs.js';
import { buildAttributeSummary, xpToNext } from '../../services/progression.js';

function progressBar(fraction: number, size = 12) {
  const full = '█';
  const empty = '░';
  const nFull = Math.max(0, Math.min(size, Math.round(size * fraction)));
  return full.repeat(nFull) + empty.repeat(size - nFull);
}

function formatV(n: number) {
  return n.toLocaleString('es-ES');
}

function msToHMS(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${ss}s`;
  return `${ss}s`;
}

export default {
  data: new SlashCommandBuilder()
    .setName('profile')
    .setDescription('Muestra tu perfil global (bonito y organizado).'),
  ns: 'profile',
  async execute(interaction: ChatInputCommandInteraction) {
    const uid = interaction.user.id;
    const u = await prisma.user.findUnique({ where: { id: uid } });
    if (!u) {
      return interaction.reply({
        content: 'Primero usa `/start` para crear tu perfil.',
        ephemeral: true,
      });
    }

    // Equipo actual
    const [pick, rod, weapon, armor] = await Promise.all([
      u.equippedPickaxeId ? prisma.item.findUnique({ where: { id: u.equippedPickaxeId } }) : null,
      u.equippedRodId ? prisma.item.findUnique({ where: { id: u.equippedRodId } }) : null,
      u.equippedWeaponId ? prisma.item.findUnique({ where: { id: u.equippedWeaponId } }) : null,
      u.equippedArmorId ? prisma.item.findUnique({ where: { id: u.equippedArmorId } }) : null,
    ]);

    // Inventario rápido
    const inv = await prisma.userItem.findMany({
      where: { userId: uid },
      include: { item: true },
    });
    const totalStacks = inv.length;
    const totalQty = inv.reduce((a, x) => a + x.quantity, 0);
    const countByType = inv.reduce<Record<string, number>>((acc, x) => {
      acc[x.item.type] = (acc[x.item.type] ?? 0) + x.quantity;
      return acc;
    }, {});

    // Daily
    const now = Date.now();
    let dailyStatus = '✅ Disponible';
    if (u.lastDailyAt) {
      const diff = now - new Date(u.lastDailyAt).getTime();
      if (diff < 24 * 60 * 60 * 1000) {
        dailyStatus = `⏳ En ${msToHMS(24 * 60 * 60 * 1000 - diff)}`;
      }
    }

    // Buffs activos (si existen)
    const buffState = extractBuffState(u.metadata);
    const buffs = buffState.active
      .map(buff => {
        const left = msToHMS(buff.until - now);
        return `• **${buff.label}** → ${left}`;
      })
      .slice(0, 6);

    // XP / nivel
    const xpTarget = xpToNext(u.level);
    const frac = Math.max(0, Math.min(0.999, u.xp / xpTarget));
    const xpBar = progressBar(frac, 14);
    const color = 0x8e44ad;

    const embed = new EmbedBuilder()
      .setAuthor({ name: `Perfil de ${interaction.user.username}` })
      .setThumbnail(interaction.user.displayAvatarURL())
      .setColor(color)
      .addFields(
        {
          name: '💰 Economía',
          value: `**V Coins:** ${formatV(u.vcoins)}`,
          inline: true,
        },
        {
          name: '🎯 Progreso',
          value: `**Nivel:** ${u.level}\n**XP:** ${formatV(u.xp)} / ${formatV(xpTarget)}\n\`${xpBar}\``,
          inline: true,
        },
        {
          name: '🛠️ Atributos',
          value: buildAttributeSummary(u),
          inline: false,
        },
        {
          name: '📦 Inventario',
          value:
            `**Stacks:** ${totalStacks} · **Total ítems:** ${formatV(totalQty)}\n` +
            `Herramientas: ${(countByType.TOOL ?? 0)} · Materiales: ${(countByType.MATERIAL ?? 0)} · Consumibles: ${(countByType.CONSUMABLE ?? 0)}`,
          inline: false,
        },
        {
          name: '🧰 Equipo',
          value:
            `⛏️ **Pico:** ${pick ? `${pick.name} (T${pick.tier ?? '-'})` : '—'}\n` +
            `🎣 **Caña:** ${rod ? `${rod.name} (T${rod.tier ?? '-'})` : '—'}\n` +
            `⚔️ **Arma:** ${weapon ? `${weapon.name}` : '—'}\n` +
            `🛡️ **Armadura:** ${armor ? `${armor.name}` : '—'}`,
          inline: false,
        },
        {
          name: '🎁 Daily',
          value: dailyStatus,
          inline: true,
        },
        ...(buffs.length
          ? [{ name: '🧪 Buffs activos', value: buffs.join('\n'), inline: false }]
          : []),
      )
      .setFooter({ text: 'Tip: usa /shop, /inventory o /equip para avanzar' });

    await interaction.reply({ embeds: [embed] });
  },
};