import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ActionRowBuilder,
} from 'discord.js';
import { prisma } from '../../lib/db.js';
import { buildPlayerCombatant, buildMonsterCombatant } from '../../services/combat.js';
import { grantExperience } from '../../services/progression.js';

interface AdventureSession {
  id: string;
  userId: string;
  optionMap: Record<string, DecisionOption>;
  resolved: boolean;
}

interface DecisionOption {
  label: string;
  successChance: number;
  success: () => Promise<string>;
  failure: () => Promise<string>;
}

const adventureSessions = new Map<string, AdventureSession>();

function randomId() {
  return `${Date.now()}-${Math.floor(Math.random() * 9999)}`;
}

async function handleLoot(userId: string) {
  const coins = 40 + Math.floor(Math.random() * 80);
  const xp = 20 + Math.floor(Math.random() * 30);
  await prisma.user.update({ where: { id: userId }, data: { vcoins: { increment: coins } } });
  await grantExperience(userId, xp);
  return `Encontraste un alijo de suministros. +${coins} V Coins · +${xp} XP`;
}

async function handleCombat(userId: string) {
  const player = await buildPlayerCombatant(userId);
  const monster = await buildMonsterCombatant();
  if (!player || !monster) {
    return 'No había enemigos que enfrentar.';
  }

  const playerScore = player.attack + player.defense + player.intellect + Math.random() * (player.luck + 10);
  const enemyScore = monster.state.attack + monster.state.defense + monster.state.intellect + Math.random() * (monster.state.luck + 10);
  if (playerScore >= enemyScore) {
    const coins = Math.max(20, Math.round(monster.vcoinsMin + Math.random() * (monster.vcoinsMax - monster.vcoinsMin + 1)));
    const xp = Math.max(15, monster.xpReward);
    await prisma.user.update({
      where: { id: userId },
      data: { vcoins: { increment: coins }, health: Math.max(1, Math.min(player.hpMax, player.hp)) },
    });
    await grantExperience(userId, xp);
    return `Derrotaste a ${monster.name} en una escaramuza rápida. +${coins} V Coins · +${xp} XP`;
  }

  const damage = Math.round(Math.random() * 20) + 10;
  const currentHp = Math.max(1, player.hp);
  const decrement = Math.min(damage, Math.max(0, currentHp - 1));
  await prisma.user.update({
    where: { id: userId },
    data: {
      health: { decrement },
    },
  });
  return `El enemigo te superó. Pierdes ${damage} de salud.`;
}

async function buildDecision(userId: string) {
  const sessionId = randomId();
  const healAmount = 20 + Math.floor(Math.random() * 20);
  const optionMap: Record<string, DecisionOption> = {
    explore: {
      label: 'Explorar la caverna',
      successChance: 0.6,
      success: async () => {
        const coins = 60 + Math.floor(Math.random() * 60);
        await prisma.user.update({ where: { id: userId }, data: { vcoins: { increment: coins } } });
        await grantExperience(userId, 35);
        return `Descubres una cámara brillante. +${coins} V Coins · +35 XP`;
      },
      failure: async () => {
        const dmg = 25 + Math.floor(Math.random() * 10);
        const current = await prisma.user.findUnique({ where: { id: userId }, select: { health: true } });
        if (current) {
          const nextHealth = Math.max(1, current.health - dmg);
          await prisma.user.update({ where: { id: userId }, data: { health: nextHealth } });
        }
        return `Una trampa se activa. Pierdes ${dmg} de salud.`;
      },
    },
    rest: {
      label: 'Acampar y descansar',
      successChance: 0.8,
      success: async () => {
        const current = await prisma.user.findUnique({ where: { id: userId }, select: { health: true, healthMax: true } });
        if (current) {
          const next = Math.min(current.healthMax, current.health + healAmount);
          await prisma.user.update({ where: { id: userId }, data: { health: next } });
        }
        return `Recuperas energías y sanas ${healAmount} de salud.`;
      },
      failure: async () => {
        const coinsLost = 30;
        const current = await prisma.user.findUnique({ where: { id: userId }, select: { vcoins: true } });
        if (current) {
          const next = Math.max(0, current.vcoins - coinsLost);
          await prisma.user.update({ where: { id: userId }, data: { vcoins: next } });
        }
        return `Mientras duermes te roban ${coinsLost} V Coins.`;
      },
    },
  };
  const session: AdventureSession = { id: sessionId, userId, optionMap, resolved: false };
  adventureSessions.set(sessionId, session);
  return session;
}

export default {
  data: new SlashCommandBuilder().setName('adventure').setDescription('Vive un evento aleatorio de aventura.'),
  ns: 'adventure',
  async execute(interaction: ChatInputCommandInteraction) {
    const uid = interaction.user.id;
    const user = await prisma.user.findUnique({ where: { id: uid } });
    if (!user) {
      return interaction.reply({ content: 'Primero usa `/start` para comenzar la aventura.', ephemeral: true });
    }

    const roll = Math.random();
    if (roll < 0.33) {
      const text = await handleLoot(uid);
      const embed = new EmbedBuilder().setTitle('Evento: Botín inesperado').setDescription(text).setColor(0xf1c40f);
      return interaction.reply({ embeds: [embed] });
    }
    if (roll < 0.66) {
      const text = await handleCombat(uid);
      const embed = new EmbedBuilder().setTitle('Encuentro de Combate').setDescription(text).setColor(0xe74c3c);
      return interaction.reply({ embeds: [embed] });
    }

    const session = await buildDecision(uid);
    const embed = new EmbedBuilder()
      .setTitle('Cruce de caminos')
      .setDescription('Una bifurcación aparece en el camino. ¿Qué decides?')
      .setColor(0x9b59b6);
    const row = new ActionRowBuilder<ButtonBuilder>();
    for (const [key, option] of Object.entries(session.optionMap)) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`adventure:choice:${session.id}:${key}`)
          .setLabel(option.label)
          .setStyle(ButtonStyle.Secondary),
      );
    }
    return interaction.reply({ embeds: [embed], components: [row] });
  },
  async handleInteraction(interaction: ButtonInteraction) {
    if (!interaction.isButton()) return;
    const [ns, action, sessionId, optionId] = interaction.customId.split(':');
    if (ns !== 'adventure' || action !== 'choice' || !sessionId || !optionId) return;

    const session = adventureSessions.get(sessionId);
    if (!session || session.resolved) {
      return interaction.reply({ content: 'Esta decisión ya fue tomada.', ephemeral: true });
    }

    if (interaction.user.id !== session.userId) {
      return interaction.reply({ content: 'Solo el aventurero original puede decidir.', ephemeral: true });
    }

    const option = session.optionMap[optionId];
    if (!option) {
      return interaction.reply({ content: 'Opción no válida.', ephemeral: true });
    }

    session.resolved = true;
    adventureSessions.delete(sessionId);

    const success = Math.random() < option.successChance;
    const result = success ? await option.success() : await option.failure();

    const embed = new EmbedBuilder()
      .setTitle('Resolución de la aventura')
      .setDescription(result)
      .setColor(success ? 0x2ecc71 : 0xe67e22);

    await interaction.update({ embeds: [embed], components: [] });
  },
};
