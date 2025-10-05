import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ButtonInteraction,
  EmbedBuilder,
  ThreadChannel,
  TextChannel,
} from 'discord.js';
import { prisma } from '../../lib/db.js';
import { grantExperience } from '../../services/progression.js';

const RAID_MIN = 3;
const RAID_MAX = 5;
const REVIVE_COOLDOWN = 5 * 60 * 1000; // 5 minutos

const ROLE_LABELS: Record<RaidRole, string> = {
  damage: '💥 Daño',
  support: '✨ Soporte',
  tank: '🛡️ Tanque',
};

const RAID_PHASES: RaidPhase[] = [
  {
    name: 'Anillos Centinela',
    description: 'Interrumpe con precisión y mantén al grupo protegido.',
    threshold: 3,
    enrageLimit: 3,
    mechanics: [
      { mechanic: 'interrupt', text: 'El Centinela canaliza un pulso. ¡Necesita interrupción inmediata!' },
      { mechanic: 'shield', text: 'Una onda expansiva se acerca, prepara escudos.' },
      { mechanic: 'taunt', text: 'El jefe fija a un aliado. El tanque debe atraer la atención.' },
    ],
  },
  {
    name: 'Corazón Ígneo',
    description: 'Coordina burst y defensas para evitar el enrage.',
    threshold: 4,
    enrageLimit: 4,
    mechanics: [
      { mechanic: 'burst', text: 'Cristales inestables aparecen. Los daños deben detonarlos.' },
      { mechanic: 'shield', text: 'Tormenta ígnea: los soportes levantan barreras.' },
      { mechanic: 'interrupt', text: 'El núcleo intenta regenerarse. ¡Interrúmpelo!' },
    ],
  },
];

const MECHANIC_ROLE: Record<RaidMechanic, RaidRole> = {
  interrupt: 'damage',
  shield: 'support',
  taunt: 'tank',
  burst: 'damage',
};

const MECHANIC_REWARD: Record<RaidMechanic, number> = {
  interrupt: 2,
  shield: 1,
  taunt: 1,
  burst: 2,
};

type RaidRole = 'damage' | 'support' | 'tank';
type RaidMechanic = 'interrupt' | 'shield' | 'taunt' | 'burst';

interface RaidPhase {
  name: string;
  description: string;
  threshold: number;
  enrageLimit: number;
  mechanics: { mechanic: RaidMechanic; text: string }[];
}

interface RaidMemberState {
  userId: string;
  role: RaidRole;
  down: boolean;
  reviveAvailableAt: number;
  contribution: number;
}

interface RaidSession {
  id: string;
  raidId: number;
  leaderId: string;
  threadId: string;
  state: 'FORMING' | 'ACTIVE' | 'COMPLETE' | 'FAILED' | 'CANCELLED';
  members: Map<string, RaidMemberState>;
  phaseIndex: number;
  progress: number;
  enrageCounter: number;
  lobbyMessageId?: string;
  promptMessageId?: string;
  prompt?: RaidPrompt;
  thread?: ThreadChannel;
}

interface RaidPrompt {
  id: string;
  mechanic: RaidMechanic;
  text: string;
  expiresAt: number;
  timeout: NodeJS.Timeout;
  responders: Set<string>;
}

const raidSessions = new Map<string, RaidSession>();

function randomId() {
  return `${Date.now()}-${Math.floor(Math.random() * 9999)}`;
}

function getSessionByUser(userId: string) {
  for (const session of raidSessions.values()) {
    if (session.members.has(userId)) return session;
  }
  return null;
}

function buildLobbyEmbed(session: RaidSession) {
  const phase = RAID_PHASES[session.phaseIndex];
  const lines = Array.from(session.members.values()).map((member) => {
    const status = member.down ? ' (caído)' : '';
    return `${ROLE_LABELS[member.role]} — <@${member.userId}>${status}`;
  });
  const content = lines.length ? lines.join('\n') : 'Nadie se ha unido todavía.';
  return new EmbedBuilder()
    .setTitle('Formación de raid')
    .setDescription(`Fase actual: **${phase.name}** — ${phase.description}`)
    .addFields({ name: `Miembros (${session.members.size}/${RAID_MAX})`, value: content })
    .setColor(0x2980b9);
}

function buildLobbyComponents(session: RaidSession) {
  const rowRoles = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`raid:join:${session.id}:damage`).setLabel('Daño').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`raid:join:${session.id}:support`).setLabel('Soporte').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`raid:join:${session.id}:tank`).setLabel('Tanque').setStyle(ButtonStyle.Secondary),
  );
  const hasMinimum = session.members.size >= RAID_MIN && hasRole(session, 'tank') && hasRole(session, 'support') && hasRole(session, 'damage');
  const rowControls = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`raid:start:${session.id}`)
      .setLabel('Iniciar')
      .setStyle(ButtonStyle.Success)
      .setDisabled(!hasMinimum),
    new ButtonBuilder().setCustomId(`raid:leave:${session.id}`).setLabel('Salir').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`raid:cancel:${session.id}`).setLabel('Cancelar').setStyle(ButtonStyle.Secondary),
  );
  return [rowRoles, rowControls];
}

function buildPromptComponents(session: RaidSession) {
  const rows = [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`raid:act:${session.id}:damage`).setLabel('Daño').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`raid:act:${session.id}:support`).setLabel('Soporte').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`raid:act:${session.id}:tank`).setLabel('Tanque').setStyle(ButtonStyle.Secondary),
    ),
  ];
  if (hasRole(session, 'support')) {
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`raid:revive:${session.id}`)
          .setLabel('Revivir aliados')
          .setStyle(ButtonStyle.Secondary),
      ),
    );
  }
  return rows;
}

function hasRole(session: RaidSession, role: RaidRole) {
  return Array.from(session.members.values()).some((member) => member.role === role);
}

function pickMechanic(session: RaidSession) {
  const phase = RAID_PHASES[session.phaseIndex];
  const pick = phase.mechanics[Math.floor(Math.random() * phase.mechanics.length)];
  return pick;
}

async function ensureThread(session: RaidSession, interaction?: ChatInputCommandInteraction | ButtonInteraction) {
  if (session.thread) return session.thread;
  if (!interaction) return null;
  const channel = await interaction.client.channels.fetch(session.threadId);
  if (!channel || !(channel instanceof ThreadChannel)) {
    throw new Error('No se pudo recuperar el hilo de la raid.');
  }
  session.thread = channel;
  return channel;
}

async function sendNextPrompt(session: RaidSession, interaction?: ButtonInteraction) {
  const thread = session.thread ?? (await ensureThread(session, interaction));
  if (!thread) return;

  const phase = RAID_PHASES[session.phaseIndex];
  const selection = pickMechanic(session);
  const promptId = randomId();
  const timeout = setTimeout(() => handlePromptTimeout(session.id, promptId), 30_000);
  const prompt: RaidPrompt = {
    id: promptId,
    mechanic: selection.mechanic,
    text: selection.text,
    expiresAt: Date.now() + 30_000,
    timeout,
    responders: new Set(),
  };
  session.prompt = prompt;

  const embed = new EmbedBuilder()
    .setTitle(`Fase ${session.phaseIndex + 1}: ${phase.name}`)
    .setDescription(selection.text)
    .setFooter({ text: `Mecánica requerida: ${ROLE_LABELS[MECHANIC_ROLE[selection.mechanic]]}` })
    .setColor(0xd35400);

  const message = await thread.send({ embeds: [embed], components: buildPromptComponents(session) });
  session.promptMessageId = message.id;
}

function handlePromptTimeout(sessionId: string, promptId: string) {
  const session = raidSessions.get(sessionId);
  if (!session || session.state !== 'ACTIVE' || !session.prompt || session.prompt.id !== promptId) return;
  resolvePrompt(session, false, null, 'Tiempo agotado. La mecánica falla.');
}

async function resolvePrompt(session: RaidSession, success: boolean, actor: RaidMemberState | null, reason: string) {
  if (!session.prompt) return;
  const mechanic = session.prompt.mechanic;
  clearTimeout(session.prompt.timeout);
  const promptMessageId = session.promptMessageId;
  session.prompt = undefined;
  session.promptMessageId = undefined;

  const thread = session.thread;
  if (promptMessageId && thread) {
    try {
      const message = await thread.messages.fetch(promptMessageId);
      await message.edit({ components: [] });
    } catch (err) {
      // ignore
    }
  }

  const phase = RAID_PHASES[session.phaseIndex];
  if (success && actor) {
    actor.contribution += MECHANIC_REWARD[mechanic] ?? 1;
    session.progress += 1;
    session.enrageCounter = Math.max(0, session.enrageCounter - 1);
    if (thread) {
      await thread.send(`✅ ${ROLE_LABELS[actor.role]} <@${actor.userId}> resuelve la mecánica. ${reason}`);
    }
    if (session.progress >= phase.threshold) {
      session.phaseIndex += 1;
      session.progress = 0;
      session.enrageCounter = 0;
      if (thread) {
        await thread.send(`🎉 Fase completada. ${session.phaseIndex < RAID_PHASES.length ? 'Prepárense para la siguiente.' : '¡Raid completada!'} `);
      }
      if (session.phaseIndex >= RAID_PHASES.length) {
        await finishRaid(session, true);
        return;
      }
    }
    setTimeout(() => {
      if (session.state === 'ACTIVE') {
        sendNextPrompt(session);
      }
    }, 4000);
  } else {
    session.enrageCounter += 1;
    if (thread) {
      await thread.send(`❌ La mecánica falla. ${reason}`);
    }
    const alive = Array.from(session.members.values()).filter((m) => !m.down);
    if (alive.length) {
      const victim = alive[Math.floor(Math.random() * alive.length)];
      victim.down = true;
      if (thread) {
        await thread.send(`💀 <@${victim.userId}> cae incapacitado.`);
      }
    }
    if (session.enrageCounter >= phase.enrageLimit) {
      if (thread) {
        await thread.send('🔥 El jefe entra en ENRAGE. La raid fracasa.');
      }
      await finishRaid(session, false);
      return;
    }
    setTimeout(() => {
      if (session.state === 'ACTIVE') {
        sendNextPrompt(session);
      }
    }, 4000);
  }
}

async function finishRaid(session: RaidSession, success: boolean) {
  session.state = success ? 'COMPLETE' : 'FAILED';
  if (session.prompt) {
    clearTimeout(session.prompt.timeout);
    session.prompt = undefined;
  }
  const rewards = success ? { xp: 180, vcoins: 220 } : { xp: 60, vcoins: 60 };
  const members = Array.from(session.members.values());
  await prisma.raid.update({
    where: { id: session.raidId },
    data: {
      state: success ? 'COMPLETED' : 'FAILED',
      metadata: { success, finishedAt: new Date().toISOString() },
    },
  });
  for (const member of members) {
    await prisma.raidMember.upsert({
      where: { raidId_userId: { raidId: session.raidId, userId: member.userId } },
      create: { raidId: session.raidId, userId: member.userId, role: member.role, contribution: member.contribution },
      update: { contribution: member.contribution, role: member.role },
    });
    await prisma.user.update({
      where: { id: member.userId },
      data: {
        vcoins: { increment: success ? rewards.vcoins : Math.round(rewards.vcoins / 2) },
      },
    });
    await grantExperience(member.userId, success ? rewards.xp : Math.round(rewards.xp / 2));
  }
  if (session.thread) {
    await session.thread.send(success ? '🏆 ¡Raid completada! Recompensas distribuidas.' : '☠️ La raid ha fracasado. Inténtenlo de nuevo.');
  }
  raidSessions.delete(session.id);
}

async function updateLobbyMessage(session: RaidSession, interaction: ButtonInteraction) {
  if (!session.lobbyMessageId) return;
  const thread = session.thread ?? (await ensureThread(session, interaction));
  if (!thread) return;
  const message = await thread.messages.fetch(session.lobbyMessageId);
  await interaction.update({ embeds: [buildLobbyEmbed(session)], components: buildLobbyComponents(session) });
  if (message.id !== interaction.message.id) {
    await message.edit({ embeds: [buildLobbyEmbed(session)], components: buildLobbyComponents(session) });
  }
}

async function createRaid(interaction: ChatInputCommandInteraction, userId: string) {
  const channel = interaction.channel;
  if (!channel || !(channel instanceof TextChannel)) {
    await interaction.reply({ content: 'Este comando solo funciona en canales de texto dentro del servidor.', ephemeral: true });
    return;
  }
  const baseName = `raid-${interaction.user.username}`.slice(0, 20);
  const thread = await channel.threads.create({
    name: baseName,
    autoArchiveDuration: 60,
    reason: 'Raid cooperativa',
  });
  const raidRecord = await prisma.raid.create({
    data: {
      threadId: thread.id,
      state: 'FORMING',
      metadata: { leaderId: userId },
    },
  });
  const session: RaidSession = {
    id: String(raidRecord.id),
    raidId: raidRecord.id,
    leaderId: userId,
    threadId: thread.id,
    state: 'FORMING',
    members: new Map(),
    phaseIndex: 0,
    progress: 0,
    enrageCounter: 0,
    thread,
  };
  raidSessions.set(session.id, session);
  const lobbyMessage = await thread.send({ embeds: [buildLobbyEmbed(session)], components: buildLobbyComponents(session) });
  session.lobbyMessageId = lobbyMessage.id;
  await interaction.reply({ content: `Raid creada en ${thread.toString()}. Únete desde el hilo.`, ephemeral: true });
}

async function handleJoin(session: RaidSession, interaction: ButtonInteraction, role: RaidRole) {
  if (session.state !== 'FORMING') {
    return interaction.reply({ content: 'La raid ya comenzó.', ephemeral: true });
  }
  if (session.members.size >= RAID_MAX && !session.members.has(interaction.user.id)) {
    return interaction.reply({ content: 'La raid ya está completa.', ephemeral: true });
  }
  const existing = session.members.get(interaction.user.id);
  const member: RaidMemberState = existing ?? {
    userId: interaction.user.id,
    role,
    down: false,
    reviveAvailableAt: 0,
    contribution: 0,
  };
  member.role = role;
  session.members.set(interaction.user.id, member);
  await prisma.raidMember.upsert({
    where: { raidId_userId: { raidId: session.raidId, userId: interaction.user.id } },
    create: { raidId: session.raidId, userId: interaction.user.id, role },
    update: { role },
  });
  await updateLobbyMessage(session, interaction);
  await interaction.followUp({ content: `Te uniste como ${ROLE_LABELS[role]}.`, ephemeral: true });
}

async function handleLeave(session: RaidSession, interaction: ButtonInteraction) {
  if (session.state !== 'FORMING') {
    return interaction.reply({ content: 'No puedes salir mientras la raid está en progreso.', ephemeral: true });
  }
  if (!session.members.has(interaction.user.id)) {
    return interaction.reply({ content: 'No estás en esta raid.', ephemeral: true });
  }
  session.members.delete(interaction.user.id);
  await prisma.raidMember.deleteMany({ where: { raidId: session.raidId, userId: interaction.user.id } });
  await updateLobbyMessage(session, interaction);
  await interaction.followUp({ content: 'Saliste de la raid.', ephemeral: true });
}

async function handleCancel(session: RaidSession, interaction: ButtonInteraction) {
  if (interaction.user.id !== session.leaderId) {
    return interaction.reply({ content: 'Solo el líder puede cancelar la raid.', ephemeral: true });
  }
  session.state = 'CANCELLED';
  raidSessions.delete(session.id);
  await prisma.raid.update({ where: { id: session.raidId }, data: { state: 'CANCELLED' } });
  if (session.thread) {
    await session.thread.send('La raid fue cancelada por el líder.');
  }
  await interaction.update({ components: [], embeds: [buildLobbyEmbed(session)] });
}

async function handleStart(session: RaidSession, interaction: ButtonInteraction) {
  if (interaction.user.id !== session.leaderId) {
    return interaction.reply({ content: 'Solo el líder puede iniciar la raid.', ephemeral: true });
  }
  if (session.members.size < RAID_MIN || !hasRole(session, 'tank') || !hasRole(session, 'support') || !hasRole(session, 'damage')) {
    return interaction.reply({ content: 'Necesitas al menos 3 jugadores con roles distintos (tanque, soporte y daño).', ephemeral: true });
  }
  session.state = 'ACTIVE';
  await prisma.raid.update({ where: { id: session.raidId }, data: { state: 'ACTIVE' } });
  await interaction.update({ components: [], embeds: [buildLobbyEmbed(session)] });
  await interaction.followUp({ content: '¡La raid comienza!', ephemeral: true });
  await sendNextPrompt(session, interaction);
}

async function handleAction(session: RaidSession, interaction: ButtonInteraction, role: RaidRole) {
  if (session.state !== 'ACTIVE' || !session.prompt) {
    return interaction.reply({ content: 'No hay ninguna mecánica activa.', ephemeral: true });
  }
  const member = session.members.get(interaction.user.id);
  if (!member) {
    return interaction.reply({ content: 'No formas parte de esta raid.', ephemeral: true });
  }
  if (member.down) {
    return interaction.reply({ content: 'Estás incapacitado. Espera un revivir.', ephemeral: true });
  }
  if (session.prompt.responders.has(interaction.user.id)) {
    return interaction.reply({ content: 'Ya respondiste a esta mecánica.', ephemeral: true });
  }
  session.prompt.responders.add(interaction.user.id);
  const required = MECHANIC_ROLE[session.prompt.mechanic];
  if (required !== role) {
    await resolvePrompt(session, false, member, `${ROLE_LABELS[role]} intentó resolver pero falló.`);
    return interaction.reply({ content: 'No era tu mecánica. ¡Tu error provoca un fallo!', ephemeral: true });
  }
  await resolvePrompt(session, true, member, 'Mecánica resuelta.');
  return interaction.reply({ content: '¡Perfecto timing!', ephemeral: true });
}

async function handleRevive(session: RaidSession, interaction: ButtonInteraction) {
  if (session.state !== 'ACTIVE') {
    return interaction.reply({ content: 'La raid no está activa.', ephemeral: true });
  }
  const member = session.members.get(interaction.user.id);
  if (!member || member.role !== 'support') {
    return interaction.reply({ content: 'Solo un soporte puede usar el revivir.', ephemeral: true });
  }
  const now = Date.now();
  if (member.reviveAvailableAt > now) {
    const remaining = Math.ceil((member.reviveAvailableAt - now) / 1000);
    return interaction.reply({ content: `Aún faltan ${remaining}s para poder revivir de nuevo.`, ephemeral: true });
  }
  const revived = Array.from(session.members.values()).filter((m) => m.down);
  if (!revived.length) {
    return interaction.reply({ content: 'Nadie necesita ser revivido.', ephemeral: true });
  }
  for (const m of revived) {
    m.down = false;
  }
  member.reviveAvailableAt = now + REVIVE_COOLDOWN;
  if (session.thread) {
    await session.thread.send(`✨ <@${interaction.user.id}> revive a los aliados caídos.`);
  }
  return interaction.reply({ content: 'Aliados revividos.', ephemeral: true });
}

export default {
  data: new SlashCommandBuilder().setName('raid').setDescription('Organiza una incursión cooperativa en un hilo.'),
  ns: 'raid',
  async execute(interaction: ChatInputCommandInteraction) {
    const uid = interaction.user.id;
    const user = await prisma.user.findUnique({ where: { id: uid } });
    if (!user) {
      return interaction.reply({ content: 'Debes usar `/start` antes de participar en raids.', ephemeral: true });
    }
    if (getSessionByUser(uid)) {
      return interaction.reply({ content: 'Ya estás en una raid activa.', ephemeral: true });
    }
    await createRaid(interaction, uid);
  },
  async handleInteraction(interaction: ButtonInteraction) {
    if (!interaction.isButton()) return;
    const [ns, action, sessionId, value] = interaction.customId.split(':');
    if (ns !== 'raid' || !sessionId) return;
    const session = raidSessions.get(sessionId);
    if (!session) {
      return interaction.reply({ content: 'Esta raid ya terminó.', ephemeral: true });
    }
    if (!session.thread) {
      session.thread = interaction.channel as ThreadChannel;
    }
    switch (action) {
      case 'join':
        if (value === 'damage' || value === 'support' || value === 'tank') {
          await handleJoin(session, interaction, value);
        }
        break;
      case 'leave':
        await handleLeave(session, interaction);
        break;
      case 'cancel':
        await handleCancel(session, interaction);
        break;
      case 'start':
        await handleStart(session, interaction);
        break;
      case 'act':
        if (value === 'damage' || value === 'support' || value === 'tank') {
          await handleAction(session, interaction, value);
        }
        break;
      case 'revive':
        await handleRevive(session, interaction);
        break;
      default:
        break;
    }
  },
};
