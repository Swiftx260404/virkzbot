import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ButtonInteraction,
} from 'discord.js';
import { prisma } from '../../lib/db.js';
import {
  buildMonsterCombatant,
  buildPlayerCombatant,
  createBattleState,
  describeBattle,
  enemyTurn,
  runPlayerSkill,
  SKILL_DEFS,
  battleStore,
  cleanupBattle,
} from '../../services/combat.js';
import { grantExperience } from '../../services/progression.js';

const DAILY_LIMIT = 5;

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null;
}

function getDailyKey() {
  return new Date().toISOString().slice(0, 10);
}

function incrementBattleCounter(metadata: any) {
  const root = isRecord(metadata) ? { ...metadata } : {};
  const key = getDailyKey();
  const battleMeta = isRecord(root.battle) ? { ...root.battle } : {};
  const daily = isRecord(battleMeta.daily) ? { ...battleMeta.daily } : {};
  const entry = isRecord(daily[key]) ? { ...daily[key] } : { count: 0 };
  entry.count = (entry.count ?? 0) + 1;
  daily[key] = entry;
  battleMeta.daily = daily;
  root.battle = battleMeta;
  return root;
}

function getBattleCount(metadata: any) {
  const root = isRecord(metadata) ? metadata : {};
  const daily = isRecord(root.battle) && isRecord(root.battle.daily) ? root.battle.daily : {};
  const key = getDailyKey();
  const entry = isRecord(daily[key]) ? daily[key] : null;
  const count = entry?.count ?? 0;
  return count;
}

function buildBattleEmbed(state: ReturnType<typeof describeBattle> & { enemyName: string }) {
  return new EmbedBuilder()
    .setTitle(state.title)
    .addFields(
      { name: 'Jugador', value: state.playerLine, inline: true },
      { name: state.enemyName, value: state.enemyLine, inline: true },
      { name: 'Acciones', value: state.log || '—', inline: false },
    )
    .setColor(state.log.includes('🎉') ? 0x2ecc71 : 0x3498db);
}

function buildComponents(battleId: string, state: { active: boolean; cooldowns: Record<string, number> }) {
  if (!state.active) return [];
  const row = new ActionRowBuilder<ButtonBuilder>();
  for (const skill of SKILL_DEFS) {
    const btn = new ButtonBuilder()
      .setCustomId(`battle:skill:${battleId}:${skill.id}`)
      .setLabel(skill.name)
      .setStyle(ButtonStyle.Primary)
      .setDisabled((state.cooldowns[skill.id] ?? 0) > 0);
    row.addComponents(btn);
  }
  const escape = new ButtonBuilder()
    .setCustomId(`battle:run:${battleId}`)
    .setLabel('Huir')
    .setStyle(ButtonStyle.Danger);
  row.addComponents(escape);
  return [row];
}

async function grantBattleLoot(userId: string, luck: number) {
  const roll = Math.random();
  const luckBonus = Math.min(0.4, luck * 0.02);
  if (roll > 0.2 + luckBonus) return null;

  const candidates = await prisma.item.findMany({ where: { type: 'MATERIAL' }, take: 50 });
  if (!candidates.length) return null;
  const item = candidates[Math.floor(Math.random() * candidates.length)];
  await prisma.userItem.upsert({
    where: { userId_itemId: { userId, itemId: item.id } },
    create: { userId, itemId: item.id, quantity: 1 },
    update: { quantity: { increment: 1 } },
  });
  return item.name;
}

export default {
  data: new SlashCommandBuilder()
    .setName('battle')
    .setDescription('Inicia un combate rápido por turnos contra un enemigo.'),
  ns: 'battle',
  async execute(interaction: ChatInputCommandInteraction) {
    const uid = interaction.user.id;
    const user = await prisma.user.findUnique({ where: { id: uid } });
    if (!user) {
      return interaction.reply({ content: 'Primero usa `/start` para crear tu perfil.', ephemeral: true });
    }

    if (battleStore.some((state) => state.userId === uid && state.active)) {
      return interaction.reply({ content: 'Ya tienes una batalla en curso.', ephemeral: true });
    }

    const count = getBattleCount(user.metadata);
    if (count >= DAILY_LIMIT) {
      return interaction.reply({ content: `Has alcanzado el límite de ${DAILY_LIMIT} batallas hoy.`, ephemeral: true });
    }

    const player = await buildPlayerCombatant(uid);
    const monster = await buildMonsterCombatant();
    if (!player || !monster) {
      return interaction.reply({ content: 'No hay enemigos disponibles por ahora.', ephemeral: true });
    }

    const updatedMeta = incrementBattleCounter(user.metadata);
    await prisma.user.update({ where: { id: uid }, data: { metadata: updatedMeta } });

    const state = createBattleState({
      userId: uid,
      player,
      enemy: monster.state,
      enemyId: monster.monsterId,
      rewards: { xp: monster.xpReward, vcoinsMin: monster.vcoinsMin, vcoinsMax: monster.vcoinsMax, name: monster.name },
    });

    const desc = describeBattle(state);
    const embed = buildBattleEmbed({ ...desc, enemyName: monster.name });
    const components = buildComponents(state.id, { active: state.active, cooldowns: state.player.cooldowns });

    const reply = await interaction.reply({ embeds: [embed], components, fetchReply: true });
    state.messageId = reply.id;
    state.channelId = reply.channelId;
  },
  async handleInteraction(interaction: ButtonInteraction) {
    if (!interaction.isButton()) return;
    const [ns, action, battleId, skillId] = interaction.customId.split(':');
    if (ns !== 'battle') return;

    const state = battleStore.get(battleId);
    if (!state) {
      if (interaction.replied || interaction.deferred) return;
      return interaction.reply({ content: 'La batalla ya terminó.', ephemeral: true });
    }

    if (interaction.user.id !== state.userId) {
      return interaction.reply({ content: 'Solo el jugador que inició la batalla puede usar estos botones.', ephemeral: true });
    }

    if (action === 'run') {
      state.active = false;
      state.log.push('🏳️ Te retiras de la batalla.');
      cleanupBattle(state.id);
      const desc = describeBattle(state);
      const embed = buildBattleEmbed({ ...desc, enemyName: state.enemy.name });
      return interaction.update({ embeds: [embed], components: [] });
    }

    if (action !== 'skill' || !skillId) return;

    try {
      runPlayerSkill(state, skillId);
    } catch (err: any) {
      return interaction.reply({ content: err.message ?? 'No puedes usar esa habilidad.', ephemeral: true });
    }

    let finished = false;
    if (!state.active) {
      finished = true;
    } else {
      const enemyAction = enemyTurn(state);
      if (!enemyAction) {
        finished = true;
      }
      if (!state.active) {
        finished = true;
      }
    }

    const rewards: string[] = [];
    if (!state.active && state.enemy.hp <= 0) {
      const xpGain = Math.max(5, state.rewards.xp);
      const minCoins = state.rewards.vcoins.min ?? 5;
      const maxCoins = Math.max(minCoins, state.rewards.vcoins.max ?? minCoins + 10);
      const coins = Math.floor(Math.random() * (maxCoins - minCoins + 1)) + minCoins;
      const luck = state.player.luck ?? 0;
      const critBonus = Math.random() < Math.min(0.5, luck * 0.02) ? Math.round(coins * 0.4) : 0;
      const totalCoins = coins + critBonus;
      await prisma.user.update({
        where: { id: state.userId },
        data: { vcoins: { increment: totalCoins }, health: Math.max(1, Math.min(state.player.hpMax, state.player.hp)) },
      });
      await grantExperience(state.userId, xpGain);
      rewards.push(`+${xpGain} XP`, `+${totalCoins} V Coins`);
      if (critBonus > 0) {
        rewards.push('💫 ¡Suerte crítica!');
      }
      const loot = await grantBattleLoot(state.userId, luck);
      if (loot) {
        rewards.push(`🎁 Botín: ${loot}`);
      }
      state.log.push(`🏆 Recompensas: ${rewards.join(' · ')}`);
      cleanupBattle(state.id);
    } else if (!state.active && state.player.hp <= 0) {
      await prisma.user.update({
        where: { id: state.userId },
        data: {
          health: Math.round(state.player.hpMax * 0.25),
          deaths: { increment: 1 },
        },
      });
      state.log.push('🩹 Tu salud ha sido restaurada parcialmente.');
      cleanupBattle(state.id);
    }

    const desc = describeBattle(state);
    const embed = buildBattleEmbed({ ...desc, enemyName: state.enemy.name });
    const components = finished ? [] : buildComponents(state.id, { active: state.active, cooldowns: state.player.cooldowns });

    await interaction.update({ embeds: [embed], components });
  },
};
