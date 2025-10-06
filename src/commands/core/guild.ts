import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ButtonInteraction,
  ChannelType
} from 'discord.js';
import { GuildMemberStatus, GuildRole, GuildUpgradeType } from '@prisma/client';
import { prisma } from '../../lib/db.js';
import {
  DEFAULT_GUILD_CAPACITY,
  GUILD_UPGRADE_CONFIG,
  computeGuildBonuses,
  describeUpgradeLevel,
  getGuildContextForUser,
  isGuildOfficer,
  nextUpgradeInfo
} from '../../services/guilds.js';

const NAME_MAX = 32;
const DESC_MAX = 200;

function cleanName(name: string) {
  return name.trim().replace(/\s+/g, ' ');
}

async function ensureProfile(interaction: ChatInputCommandInteraction) {
  const user = await prisma.user.findUnique({ where: { id: interaction.user.id } });
  if (!user) {
    await interaction.reply({ content: 'Primero usa `/start` para crear tu perfil.', ephemeral: true });
    return null;
  }
  return user;
}

async function buildGuildEmbed(guildId: number, viewerId?: string) {
  const guild = await prisma.guild.findUnique({
    where: { id: guildId },
    include: {
      upgrades: true,
      members: { where: { status: GuildMemberStatus.ACTIVE }, select: { userId: true, role: true } }
    }
  });
  if (!guild) return null;

  const bonuses = computeGuildBonuses(guild.upgrades ?? []);
  const memberCount = guild.members.length;
  const pendingCount = await prisma.guildMember.count({ where: { guildId, status: GuildMemberStatus.PENDING } });
  const bankItems = await prisma.guildBankItem.findMany({
    where: { guildId, quantity: { gt: 0 } },
    include: { item: true },
    orderBy: { quantity: 'desc' },
    take: 5
  });

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`🏰 ${guild.name}`)
    .setDescription(guild.description?.slice(0, DESC_MAX) || '—')
    .addFields(
      { name: 'Líder', value: `<@${guild.leaderId}>`, inline: true },
      { name: 'Miembros', value: `${memberCount}/${guild.capacity}`, inline: true },
      { name: 'Banco', value: `${guild.bankCoins} V Coins`, inline: true }
    )
    .setFooter({ text: `ID ${guild.id}` });

  if (pendingCount > 0) {
    embed.addFields({ name: 'Solicitudes pendientes', value: `${pendingCount}`, inline: true });
  }

  if (bonuses.dropRate > 0 || bonuses.inventoryCapacity > 0) {
    const lines: string[] = [];
    if (bonuses.dropRate > 0) {
      lines.push(`Drop +${Math.round(bonuses.dropRate * 100)}%`);
    }
    if (bonuses.inventoryCapacity > 0) {
      lines.push(`Capacidad inventario +${bonuses.inventoryCapacity}`);
    }
    embed.addFields({ name: 'Bonificaciones activas', value: lines.join(' · '), inline: false });
  }

  const upgradeLines = Object.values(GuildUpgradeType).map((type) => {
    const def = GUILD_UPGRADE_CONFIG[type];
    const upgrade = guild.upgrades.find((u) => u.type === type);
    const level = upgrade?.level ?? 0;
    const current = level > 0 ? describeUpgradeLevel(type, level) : 'Sin mejora';
    const next = nextUpgradeInfo(type, level);
    const nextText = next ? ` → Próx: ${next.label} (${next.cost} V)` : ' (Máx)';
    return `• **${def.label}:** ${current}${next ? nextText : ''}`;
  });
  embed.addFields({ name: 'Mejoras', value: upgradeLines.join('\n'), inline: false });

  if (bankItems.length) {
    const lines = bankItems.map((entry) => `• ${entry.quantity} × ${entry.item?.name ?? 'Ítem'}`);
    embed.addFields({ name: 'Almacén (top 5)', value: lines.join('\n'), inline: false });
  }

  if (viewerId) {
    const myMember = guild.members.find((m) => m.userId === viewerId);
    if (myMember) {
      embed.addFields({ name: 'Tu rol', value: myMember.role, inline: true });
    }
  }

  return embed;
}

async function handleCreate(interaction: ChatInputCommandInteraction) {
  const profile = await ensureProfile(interaction);
  if (!profile) return;

  const existing = await prisma.guildMember.findUnique({ where: { userId: interaction.user.id } });
  if (existing) {
    if (existing.status === GuildMemberStatus.PENDING) {
      await interaction.reply({ content: 'Ya tienes una solicitud pendiente.', ephemeral: true });
    } else {
      await interaction.reply({ content: 'Ya perteneces a un gremio.', ephemeral: true });
    }
    return;
  }

  const rawName = interaction.options.getString('nombre', true);
  const name = cleanName(rawName).slice(0, NAME_MAX);
  if (!name) {
    await interaction.reply({ content: 'El nombre del gremio no puede estar vacío.', ephemeral: true });
    return;
  }

  const duplicate = await prisma.guild.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } });
  if (duplicate) {
    await interaction.reply({ content: 'Ya existe un gremio con ese nombre.', ephemeral: true });
    return;
  }

  const description = interaction.options.getString('descripcion')?.slice(0, DESC_MAX) ?? null;

  const guild = await prisma.$transaction(async (tx) => {
    const created = await tx.guild.create({
      data: {
        name,
        description,
        leaderId: interaction.user.id,
        capacity: DEFAULT_GUILD_CAPACITY
      }
    });
    await tx.guildMember.create({
      data: {
        guildId: created.id,
        userId: interaction.user.id,
        role: GuildRole.LEADER,
        status: GuildMemberStatus.ACTIVE,
        joinedAt: new Date()
      }
    });
    return created;
  });

  await interaction.reply({ content: `✅ Gremio **${guild.name}** creado.`, ephemeral: true });
}

async function handleJoin(interaction: ChatInputCommandInteraction) {
  const profile = await ensureProfile(interaction);
  if (!profile) return;

  const existing = await prisma.guildMember.findUnique({ where: { userId: interaction.user.id } });
  if (existing) {
    if (existing.status === GuildMemberStatus.PENDING) {
      await interaction.reply({ content: 'Ya enviaste una solicitud. Espera la respuesta.', ephemeral: true });
    } else {
      await interaction.reply({ content: 'Ya perteneces a un gremio.', ephemeral: true });
    }
    return;
  }

  const rawName = interaction.options.getString('nombre', true);
  const name = cleanName(rawName);
  const guild = await prisma.guild.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } });
  if (!guild) {
    await interaction.reply({ content: 'No encontré un gremio con ese nombre.', ephemeral: true });
    return;
  }

  const memberCount = await prisma.guildMember.count({ where: { guildId: guild.id, status: GuildMemberStatus.ACTIVE } });
  if (memberCount >= guild.capacity) {
    await interaction.reply({ content: 'Ese gremio está en su capacidad máxima.', ephemeral: true });
    return;
  }

  await prisma.guildMember.create({
    data: {
      guildId: guild.id,
      userId: interaction.user.id,
      status: GuildMemberStatus.PENDING
    }
  });

  await interaction.reply({ content: `📨 Solicitud enviada a **${guild.name}**.`, ephemeral: true });

  const officers = await prisma.guildMember.findMany({
    where: {
      guildId: guild.id,
      status: GuildMemberStatus.ACTIVE,
      role: { in: [GuildRole.LEADER, GuildRole.OFFICER] }
    },
    select: { userId: true }
  });
  const mentions = officers.map((o) => `<@${o.userId}>`).filter((id, idx, arr) => arr.indexOf(id) === idx);
  const embed = new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle(`Solicitud de ${interaction.user.username}`)
    .setDescription(`<@${interaction.user.id}> quiere unirse a **${guild.name}**.`)
    .setFooter({ text: 'Usa los botones para responder.' });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`guild:approve:${guild.id}:${interaction.user.id}`)
      .setStyle(ButtonStyle.Success)
      .setLabel('Aprobar'),
    new ButtonBuilder()
      .setCustomId(`guild:reject:${guild.id}:${interaction.user.id}`)
      .setStyle(ButtonStyle.Danger)
      .setLabel('Rechazar')
  );

  const channel = interaction.channel;
  if (channel && channel.type !== ChannelType.DM && channel.isTextBased() && 'send' in channel) {
    const content = mentions.length ? `📨 Nueva solicitud de gremio: ${mentions.join(' ')}` : '📨 Nueva solicitud de gremio';
    await channel.send({ content, embeds: [embed], components: [row] });
  }
}

async function handleInfo(interaction: ChatInputCommandInteraction) {
  const targetName = interaction.options.getString('nombre');
  if (targetName) {
    const name = cleanName(targetName);
    const guild = await prisma.guild.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } });
    if (!guild) {
      await interaction.reply({ content: 'No encontré un gremio con ese nombre.', ephemeral: true });
      return;
    }
    const embed = await buildGuildEmbed(guild.id, interaction.user.id);
    if (!embed) {
      await interaction.reply({ content: 'No se pudo cargar la información del gremio.', ephemeral: true });
      return;
    }
    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  const ctx = await getGuildContextForUser(interaction.user.id);
  if (!ctx) {
    await interaction.reply({ content: 'No perteneces a ningún gremio.', ephemeral: true });
    return;
  }
  const embed = await buildGuildEmbed(ctx.guild.id, interaction.user.id);
  if (!embed) {
    await interaction.reply({ content: 'No se pudo cargar la información del gremio.', ephemeral: true });
    return;
  }
  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleUpgrade(interaction: ChatInputCommandInteraction) {
  const ctx = await getGuildContextForUser(interaction.user.id);
  if (!ctx) {
    await interaction.reply({ content: 'Debes estar en un gremio para mejorarlo.', ephemeral: true });
    return;
  }
  if (!isGuildOfficer(ctx.member)) {
    await interaction.reply({ content: 'Solo líderes u oficiales pueden comprar mejoras.', ephemeral: true });
    return;
  }

  const rawType = interaction.options.getString('tipo', true) as GuildUpgradeType;
  const def = GUILD_UPGRADE_CONFIG[rawType];
  if (!def) {
    await interaction.reply({ content: 'Tipo de mejora desconocido.', ephemeral: true });
    return;
  }

  const existing = await prisma.guildUpgrade.findUnique({ where: { guildId_type: { guildId: ctx.guild.id, type: rawType } } });
  const level = existing?.level ?? 0;
  const next = nextUpgradeInfo(rawType, level);
  if (!next) {
    await interaction.reply({ content: 'Esta mejora ya está al máximo nivel.', ephemeral: true });
    return;
  }
  if (ctx.guild.bankCoins < next.cost) {
    await interaction.reply({ content: `El banco del gremio necesita ${next.cost} V Coins para esta mejora.`, ephemeral: true });
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.guild.update({ where: { id: ctx.guild.id }, data: { bankCoins: { decrement: next.cost } } });
    if (existing) {
      await tx.guildUpgrade.update({ where: { id: existing.id }, data: { level: existing.level + 1 } });
    } else {
      await tx.guildUpgrade.create({ data: { guildId: ctx.guild.id, type: rawType, level: 1 } });
    }
  });

  await interaction.reply({ content: `✅ Mejora **${def.label}** adquirida.`, ephemeral: true });
}

async function handleGuildButton(interaction: ButtonInteraction) {
  if (!interaction.customId.startsWith('guild:')) return;
  const [, action, guildIdStr, targetId] = interaction.customId.split(':');
  const guildId = Number(guildIdStr);
  if (!Number.isInteger(guildId)) {
    await interaction.reply({ content: 'Solicitud inválida.', ephemeral: true });
    return;
  }

  const member = await prisma.guildMember.findFirst({
    where: { guildId, userId: interaction.user.id, status: GuildMemberStatus.ACTIVE }
  });
  if (!isGuildOfficer(member)) {
    await interaction.reply({ content: 'Solo oficiales pueden responder esta solicitud.', ephemeral: true });
    return;
  }

  try {
    if (action === 'approve') {
      await prisma.$transaction(async (tx) => {
        const request = await tx.guildMember.findFirst({ where: { guildId, userId: targetId } });
        if (!request || request.status !== GuildMemberStatus.PENDING) throw new Error('NOT_PENDING');
        const guild = await tx.guild.findUnique({ where: { id: guildId } });
        if (!guild) throw new Error('NO_GUILD');
        const count = await tx.guildMember.count({ where: { guildId, status: GuildMemberStatus.ACTIVE } });
        if (count >= guild.capacity) throw new Error('GUILD_FULL');
        await tx.guildMember.update({
          where: { id: request.id },
          data: { status: GuildMemberStatus.ACTIVE, role: GuildRole.MEMBER, joinedAt: new Date() }
        });
      });
      const embed = await buildGuildEmbed(guildId);
      const targetUser = await interaction.client.users.fetch(targetId).catch(() => null);
      if (targetUser) {
        await targetUser.send(`✅ Fuiste aceptado en el gremio.`).catch(() => null);
      }
      await interaction.update({ content: `✅ Solicitud aprobada para <@${targetId}>.`, embeds: embed ? [embed] : [], components: [] });
    } else if (action === 'reject') {
      await prisma.$transaction(async (tx) => {
        const request = await tx.guildMember.findFirst({ where: { guildId, userId: targetId } });
        if (!request || request.status !== GuildMemberStatus.PENDING) throw new Error('NOT_PENDING');
        await tx.guildMember.delete({ where: { id: request.id } });
      });
      const targetUser = await interaction.client.users.fetch(targetId).catch(() => null);
      if (targetUser) {
        await targetUser.send('❌ Tu solicitud al gremio fue rechazada.').catch(() => null);
      }
      await interaction.update({ content: `Solicitud rechazada para <@${targetId}>.`, embeds: [], components: [] });
    }
  } catch (error: any) {
    const reason = error?.message ?? 'ERROR';
    const message =
      reason === 'GUILD_FULL'
        ? 'El gremio alcanzó su límite de miembros.'
        : reason === 'NOT_PENDING'
          ? 'La solicitud ya no está pendiente.'
          : 'No se pudo procesar la solicitud.';
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: message, ephemeral: true });
    } else {
      await interaction.reply({ content: message, ephemeral: true });
    }
  }
}

export default {
  data: new SlashCommandBuilder()
    .setName('guild')
    .setDescription('Gestiona tu gremio.')
    .addSubcommand((sub) =>
      sub
        .setName('create')
        .setDescription('Crea un nuevo gremio.')
        .addStringOption((opt) =>
          opt.setName('nombre').setDescription('Nombre del gremio').setRequired(true)
        )
        .addStringOption((opt) =>
          opt.setName('descripcion').setDescription('Descripción opcional del gremio')
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('join')
        .setDescription('Solicita unirte a un gremio.')
        .addStringOption((opt) => opt.setName('nombre').setDescription('Nombre del gremio').setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName('info')
        .setDescription('Muestra información de tu gremio o de otro por nombre.')
        .addStringOption((opt) => opt.setName('nombre').setDescription('Nombre del gremio'))
    )
    .addSubcommand((sub) =>
      sub
        .setName('upgrade')
        .setDescription('Compra mejoras del gremio (solo oficiales).')
        .addStringOption((opt) =>
          opt
            .setName('tipo')
            .setDescription('Tipo de mejora')
            .setRequired(true)
            .addChoices(
              ...Object.values(GuildUpgradeType).map((type) => ({
                name: GUILD_UPGRADE_CONFIG[type].label,
                value: type
              }))
            )
        )
    ),
  ns: 'guild',
  async execute(interaction: ChatInputCommandInteraction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'create') return handleCreate(interaction);
    if (sub === 'join') return handleJoin(interaction);
    if (sub === 'info') return handleInfo(interaction);
    if (sub === 'upgrade') return handleUpgrade(interaction);
    await interaction.reply({ content: 'Subcomando no soportado.', ephemeral: true });
  },
  async handleInteraction(interaction: ButtonInteraction) {
    if (!interaction.isButton()) return;
    await handleGuildButton(interaction);
  }
};
