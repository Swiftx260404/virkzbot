import { Collection } from 'discord.js';
import { prisma } from '../lib/db.js';
import { computeBonusDamage, computeCritChance, computeDodgeChance } from './progression.js';
import { applyPassiveToCombatant, getActivePetContext } from './pets.js';

export interface CombatSkill {
  id: string;
  name: string;
  description: string;
  cooldown: number;
  execute: (ctx: SkillContext) => SkillResult;
}

export interface SkillContext {
  player: CombatantState;
  enemy: CombatantState;
  turn: number;
}

export interface SkillResult {
  damage: number;
  critChanceBonus?: number;
  shield?: number;
  selfHeal?: number;
  recoil?: number;
}

export interface CombatantState {
  name: string;
  hp: number;
  hpMax: number;
  attack: number;
  defense: number;
  strength?: number;
  intellect: number;
  agility: number;
  luck: number;
  critChance: number;
  dodgeChance: number;
}

export interface BattleState {
  id: string;
  userId: string;
  enemyId: number;
  turn: number;
  player: CombatantState & { cooldowns: Record<string, number>; shield: number };
  enemy: CombatantState;
  rewards: {
    xp: number;
    vcoins: { min: number; max: number };
    name: string;
  };
  log: string[];
  active: boolean;
  messageId?: string;
  channelId?: string;
  createdAt: number;
  skills: CombatSkill[];
}

function round(num: number) {
  return Math.round(num * 100) / 100;
}

export const SKILL_DEFS: CombatSkill[] = [
  {
    id: 'quick_strike',
    name: 'Golpe Rápido',
    description: 'Ataque ágil con mayor probabilidad de crítico.',
    cooldown: 0,
    execute: ({ player }) => {
      return {
        damage: player.attack * 1.0 + (player.strength ?? 0) * 1.5 + player.agility * 0.5,
        critChanceBonus: 0.1 + player.agility * 0.005,
      };
    },
  },
  {
    id: 'power_strike',
    name: 'Impacto Brutal',
    description: 'Golpe devastador con breve enfriamiento. Reduce tu defensa temporalmente.',
    cooldown: 1,
    execute: ({ player }) => {
      return {
        damage: player.attack * 1.6 + computeBonusDamage(player.strength ?? 0, player.intellect * 0.5),
        recoil: 0.15,
      };
    },
  },
  {
    id: 'guard_focus',
    name: 'Guardia Focalizada',
    description: 'Reduce el daño recibido este turno y contraataca levemente.',
    cooldown: 1,
    execute: ({ player }) => {
      return {
        damage: player.attack * 0.6,
        shield: 10 + player.intellect * 2 + player.agility,
      };
    },
  },
  {
    id: 'arcane_burst',
    name: 'Descarga Arcana',
    description: 'Descarga mágica basada en tu intelecto que puede aplicar crítico alto.',
    cooldown: 2,
    execute: ({ player }) => {
      return {
        damage: player.intellect * 3 + (player.strength ?? 0) + player.attack * 0.4,
        critChanceBonus: 0.2 + player.luck * 0.01,
      };
    },
  },
];

export const battleStore = new Collection<string, BattleState>();

export async function buildPlayerCombatant(userId: string): Promise<CombatantState | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      items: {
        include: {
          item: true,
        },
      },
    },
  });
  if (!user) return null;

  const weapon = user.equippedWeaponId
    ? await prisma.item.findUnique({ where: { id: user.equippedWeaponId } })
    : null;
  const armor = user.equippedArmorId
    ? await prisma.item.findUnique({ where: { id: user.equippedArmorId } })
    : null;

  const weaponPower = weapon?.power ?? 0;
  const armorPower = armor?.power ?? 0;

  const attack = user.attack + weaponPower + user.strength * 2 + Math.floor(user.agility * 0.5);
  const defense = user.defense + armorPower + Math.floor(user.strength * 0.8) + Math.floor(user.agility * 0.3);
  const intellect = user.intellect;
  const agility = user.agility;
  const luck = user.luck;

  const hpMax = user.healthMax + armorPower * 5 + user.strength * 4 + user.intellect * 2;
  const hp = Math.max(1, Math.min(hpMax, user.health));

  const combatant: CombatantState = {
    name: 'Tú',
    hp,
    hpMax,
    attack,
    defense,
    strength: user.strength,
    intellect,
    agility,
    luck,
    critChance: computeCritChance(0.1 + (weaponPower > 0 ? 0.05 : 0), luck),
    dodgeChance: computeDodgeChance(agility),
  };

  const petContext = await getActivePetContext(userId);
  if (petContext) {
    applyPassiveToCombatant(combatant, petContext);
  }

  return combatant;
}

export interface MonsterCombatant {
  monsterId: number;
  state: CombatantState;
  xpReward: number;
  vcoinsMin: number;
  vcoinsMax: number;
  name: string;
}

export async function buildMonsterCombatant(): Promise<MonsterCombatant | null> {
  const monsters = await prisma.monster.findMany({});
  if (!monsters.length) return null;
  const pick = monsters[Math.floor(Math.random() * monsters.length)];
  const hpMax = pick.hp;
  const attack = pick.attack;
  const defense = pick.defense;
  return {
    monsterId: pick.id,
    state: {
      name: pick.name,
      hp: hpMax,
      hpMax,
      attack,
      defense,
      strength: Math.max(1, pick.level),
      intellect: Math.max(1, Math.floor(pick.level / 2)),
      agility: Math.max(1, Math.floor(pick.level / 2)),
      luck: Math.max(1, Math.floor(pick.level / 3)),
      critChance: Math.min(0.35, pick.critChance + 0.02 * pick.level),
      dodgeChance: Math.min(0.2, 0.01 * pick.level),
    },
    xpReward: pick.xpReward,
    vcoinsMin: pick.vcoinsMin,
    vcoinsMax: pick.vcoinsMax,
    name: pick.name,
  };
}

function applyDamage(attack: number, defense: number) {
  const mitigated = attack - defense * 0.4;
  return Math.max(1, Math.round(mitigated));
}

export function createBattleState(opts: {
  userId: string;
  player: CombatantState;
  enemy: CombatantState;
  enemyId: number;
  rewards: { xp: number; vcoinsMin: number; vcoinsMax: number; name: string };
  skills?: CombatSkill[];
}): BattleState {
  const id = `${Date.now()}-${Math.floor(Math.random() * 9999)}`;
  const state: BattleState = {
    id,
    userId: opts.userId,
    enemyId: opts.enemyId,
    turn: 1,
    player: { ...opts.player, cooldowns: {}, shield: 0 },
    enemy: { ...opts.enemy },
    rewards: { xp: opts.rewards.xp, vcoins: { min: opts.rewards.vcoinsMin, max: opts.rewards.vcoinsMax }, name: opts.rewards.name },
    log: ['⚔️ ¡La batalla comienza!'],
    active: true,
    createdAt: Date.now(),
    skills: opts.skills ?? SKILL_DEFS,
  };
  battleStore.set(id, state);
  return state;
}

export function describeBattle(state: BattleState) {
  const { player, enemy } = state;
  return {
    title: `Turno ${state.turn}`,
    playerLine: `❤️ ${player.hp}/${player.hpMax} · 🛡️ ${round(player.defense)} · Crit ${(player.critChance * 100).toFixed(0)}%`,
    enemyLine: `❤️ ${enemy.hp}/${enemy.hpMax} · 🛡️ ${round(enemy.defense)} · Crit ${(enemy.critChance * 100).toFixed(0)}%`,
    log: state.log.slice(-5).join('\n'),
  };
}

export function runPlayerSkill(state: BattleState, skillId: string) {
  if (!state.active) {
    throw new Error('La batalla ya finalizó.');
  }
  const skill = state.skills.find((s) => s.id === skillId);
  if (!skill) {
    throw new Error('Habilidad desconocida.');
  }
  const currentCd = state.player.cooldowns[skill.id] ?? 0;
  if (currentCd > 0) {
    throw new Error('La habilidad aún está en cooldown.');
  }

  const result = skill.execute({ player: state.player, enemy: state.enemy, turn: state.turn });
  const critChance = Math.min(0.75, state.player.critChance + (result.critChanceBonus ?? 0));
  const isCrit = Math.random() < critChance;
  let damage = applyDamage(result.damage, state.enemy.defense);
  if (isCrit) {
    damage = Math.round(damage * (1.5 + state.player.luck * 0.02));
  }
  state.enemy.hp = Math.max(0, state.enemy.hp - damage);
  state.log.push(`🗡️ Usas **${skill.name}** y causas ${damage} de daño${isCrit ? ' crítico' : ''}.`);

  if (result.shield) {
    state.player.shield = Math.round(result.shield);
    state.log.push(`🛡️ Ganas un escudo de ${state.player.shield}.`);
  } else {
    state.player.shield = 0;
  }
  if (result.selfHeal) {
    state.player.hp = Math.min(state.player.hpMax, state.player.hp + Math.round(result.selfHeal));
    state.log.push('💚 Recuperas salud.');
  }
  if (result.recoil) {
    const loss = Math.round(state.player.defense * result.recoil);
    state.player.defense = Math.max(1, state.player.defense - loss);
    state.log.push('⚠️ Tu defensa baja temporalmente.');
  }

  if (state.enemy.hp <= 0) {
    state.active = false;
    state.log.push('🎉 ¡Victoria!');
  }

  if (skill.cooldown > 0) {
    state.player.cooldowns[skill.id] = skill.cooldown + 1;
  }

  // reduce cooldowns at end of turn
  for (const key of Object.keys(state.player.cooldowns)) {
    state.player.cooldowns[key] = Math.max(0, state.player.cooldowns[key] - 1);
  }

  return { damage, isCrit };
}

export function enemyTurn(state: BattleState) {
  if (!state.active) return null;
  state.turn += 1;

  const enemy = state.enemy;
  const player = state.player;

  // enemy attack
  const miss = Math.random() < player.dodgeChance;
  if (miss) {
    state.log.push(`${enemy.name} falla su ataque.`);
    return { damage: 0, missed: true };
  }

  let dmg = applyDamage(enemy.attack, player.defense);
  const crit = Math.random() < enemy.critChance;
  if (crit) {
    dmg = Math.round(dmg * 1.4);
  }

  if (player.shield > 0) {
    const blocked = Math.min(player.shield, dmg);
    dmg -= blocked;
    player.shield = Math.max(0, player.shield - blocked);
    state.log.push(`🛡️ Tu escudo bloquea ${blocked} de daño.`);
  }

  player.hp = Math.max(0, player.hp - dmg);
  state.log.push(`${enemy.name} te golpea por ${dmg} de daño${crit ? ' crítico' : ''}.`);

  if (player.hp <= 0) {
    state.active = false;
    state.log.push('💀 Has sido derrotado.');
  }

  return { damage: dmg, crit };
}

export function cleanupBattle(battleId: string) {
  battleStore.delete(battleId);
}

