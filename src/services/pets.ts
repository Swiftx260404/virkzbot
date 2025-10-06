import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../lib/db.js';
import type { CombatSkill, CombatantState } from './combat.js';

export const PET_LEVEL_CAP = 60;

export interface PetPassiveConfig {
  attack?: number;
  defense?: number;
  hp?: number;
  luck?: number;
  dropRate?: number;
  resourceYield?: number;
  critChance?: number;
  coinGain?: number;
}

export interface PetPassiveComputed extends Required<PetPassiveConfig> {}

export interface PetSkillConfig {
  key: string;
  name: string;
  description: string;
  cooldown: number;
  scaling?: {
    attack?: number;
    defense?: number;
    strength?: number;
    intellect?: number;
    agility?: number;
    luck?: number;
  };
  flat?: number;
  critBonus?: number;
  shield?: number;
  heal?: number;
}

export interface PetEvolutionRequirement {
  level?: number;
  bond?: number;
  items?: { key: string; qty: number }[];
}

export interface ActivePetContext {
  userPet: Prisma.UserPetGetPayload<{ include: { pet: { include: { evolvesTo: true } } } }>;
  passive: PetPassiveComputed;
  passiveConfig: PetPassiveConfig;
  skill?: PetSkillConfig;
  multiplier: number;
}

type PrismaClientOrTx = PrismaClient | Prisma.TransactionClient;

function getClient(client?: PrismaClientOrTx) {
  return client ?? prisma;
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function ensurePassiveConfig(raw: unknown): PetPassiveConfig {
  if (!isRecord(raw)) return {};
  const config: PetPassiveConfig = {};
  const maybe = (key: keyof PetPassiveConfig) => {
    const value = raw[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      config[key] = value;
    }
  };
  maybe('attack');
  maybe('defense');
  maybe('hp');
  maybe('luck');
  maybe('dropRate');
  maybe('resourceYield');
  maybe('critChance');
  maybe('coinGain');
  return config;
}

function ensureSkillConfig(raw: unknown): PetSkillConfig | undefined {
  if (!isRecord(raw)) return undefined;
  if (typeof raw.key !== 'string' || typeof raw.name !== 'string') return undefined;
  if (typeof raw.description !== 'string') return undefined;
  const cooldown = Number(raw.cooldown ?? 0);
  if (!Number.isFinite(cooldown) || cooldown < 0) return undefined;
  const config: PetSkillConfig = {
    key: raw.key,
    name: raw.name,
    description: raw.description,
    cooldown: Math.max(0, Math.round(cooldown)),
  };
  if (isRecord(raw.scaling)) {
    const scaling: NonNullable<PetSkillConfig['scaling']> = {};
    for (const key of ['attack', 'defense', 'strength', 'intellect', 'agility', 'luck'] as const) {
      const value = raw.scaling[key];
      if (typeof value === 'number' && Number.isFinite(value)) {
        scaling[key] = value;
      }
    }
    if (Object.keys(scaling).length > 0) {
      config.scaling = scaling;
    }
  }
  if (typeof raw.flat === 'number' && Number.isFinite(raw.flat)) {
    config.flat = raw.flat;
  }
  if (typeof raw.critBonus === 'number' && Number.isFinite(raw.critBonus)) {
    config.critBonus = raw.critBonus;
  }
  if (typeof raw.shield === 'number' && Number.isFinite(raw.shield)) {
    config.shield = raw.shield;
  }
  if (typeof raw.heal === 'number' && Number.isFinite(raw.heal)) {
    config.heal = raw.heal;
  }
  return config;
}

export function petXpToNext(level: number) {
  const cappedLevel = Math.min(level, PET_LEVEL_CAP);
  return Math.max(40, Math.round(60 + cappedLevel * cappedLevel * 22));
}

export function computeTrainingMultiplier(level: number, bond: number) {
  const levelFactor = 1 + Math.min(level, PET_LEVEL_CAP) * 0.02;
  const bondFactor = 1 + Math.max(0, Math.min(100, bond)) * 0.01;
  return levelFactor * bondFactor;
}

function scalePassive(config: PetPassiveConfig, level: number, bond: number): PetPassiveComputed {
  const multiplier = computeTrainingMultiplier(level, bond) / 2.5;
  return {
    attack: (config.attack ?? 0) * multiplier,
    defense: (config.defense ?? 0) * multiplier,
    hp: (config.hp ?? 0) * multiplier,
    luck: (config.luck ?? 0) * multiplier,
    dropRate: (config.dropRate ?? 0) * multiplier,
    resourceYield: (config.resourceYield ?? 0) * multiplier,
    critChance: (config.critChance ?? 0) * multiplier,
    coinGain: (config.coinGain ?? 0) * multiplier,
  };
}

export async function getActivePetContext(userId: string, client?: PrismaClientOrTx): Promise<ActivePetContext | null> {
  const prismaClient = getClient(client);
  const userPet = await prismaClient.userPet.findFirst({
    where: { userId, active: true },
    include: { pet: { include: { evolvesTo: true } } },
  });
  if (!userPet) return null;
  const passiveConfig = ensurePassiveConfig(userPet.pet.passiveBonus);
  const skill = ensureSkillConfig(userPet.pet.activeSkill);
  const passive = scalePassive(passiveConfig, userPet.level, userPet.bond);
  const multiplier = computeTrainingMultiplier(userPet.level, userPet.bond);
  return { userPet, passive, passiveConfig, skill, multiplier };
}

export async function getPetBonuses(userId: string, client?: PrismaClientOrTx) {
  const ctx = await getActivePetContext(userId, client);
  return ctx?.passive ?? null;
}

export function summarizePassiveBonus(passive: PetPassiveComputed) {
  const parts: string[] = [];
  const percent = (value: number) => `${Math.round(value * 100)}%`;
  if (passive.attack) parts.push(`ATQ +${percent(passive.attack)}`);
  if (passive.defense) parts.push(`DEF +${percent(passive.defense)}`);
  if (passive.hp) parts.push(`HP +${percent(passive.hp)}`);
  if (passive.luck) parts.push(`SUERTE +${percent(passive.luck)}`);
  if (passive.dropRate) parts.push(`DROP +${percent(passive.dropRate)}`);
  if (passive.resourceYield) parts.push(`RECOLECCIÓN +${percent(passive.resourceYield)}`);
  if (passive.critChance) parts.push(`CRIT +${percent(passive.critChance)}`);
  if (passive.coinGain) parts.push(`COINS +${percent(passive.coinGain)}`);
  return parts;
}

export function applyPassiveToCombatant(state: CombatantState, ctx: ActivePetContext) {
  const passive = ctx.passive;
  if (passive.attack) {
    state.attack = Math.round(state.attack * (1 + passive.attack));
  }
  if (passive.defense) {
    state.defense = Math.round(state.defense * (1 + passive.defense));
  }
  if (passive.hp) {
    state.hpMax = Math.round(state.hpMax * (1 + passive.hp));
    state.hp = Math.min(state.hpMax, Math.round(state.hp * (1 + passive.hp)));
  }
  if (passive.luck) {
    state.luck = Math.round(state.luck * (1 + passive.luck));
  }
  if (passive.critChance) {
    state.critChance = Math.min(0.95, state.critChance + passive.critChance);
  }
}

export function buildPetCombatSkill(ctx: ActivePetContext): CombatSkill | null {
  if (!ctx.skill) return null;
  const skill = ctx.skill;
  const scale = Math.max(1, ctx.multiplier / 1.8);
  const id = `pet:${ctx.userPet.id}:${skill.key}`;
  return {
    id,
    name: `${skill.name} 🐾`,
    description: skill.description,
    cooldown: skill.cooldown,
    execute: ({ player }) => {
      let damage = skill.flat ?? 0;
      if (skill.scaling) {
        if (skill.scaling.attack) damage += player.attack * skill.scaling.attack;
        if (skill.scaling.defense) damage += player.defense * skill.scaling.defense;
        if (skill.scaling.strength) damage += (player.strength ?? 0) * skill.scaling.strength;
        if (skill.scaling.intellect) damage += player.intellect * skill.scaling.intellect;
        if (skill.scaling.agility) damage += player.agility * skill.scaling.agility;
        if (skill.scaling.luck) damage += player.luck * skill.scaling.luck;
      }
      damage *= scale;
      const result: ReturnType<CombatSkill['execute']> = { damage };
      if (skill.critBonus) {
        result.critChanceBonus = skill.critBonus;
      }
      if (skill.shield) {
        result.shield = skill.shield * scale;
      }
      if (skill.heal) {
        result.selfHeal = skill.heal * scale;
      }
      return result;
    },
  };
}

export function parseEvolutionRequirements(raw: unknown): PetEvolutionRequirement {
  if (!isRecord(raw)) return {};
  const req: PetEvolutionRequirement = {};
  if (typeof raw.level === 'number' && Number.isFinite(raw.level)) {
    req.level = Math.max(1, Math.round(raw.level));
  }
  if (typeof raw.bond === 'number' && Number.isFinite(raw.bond)) {
    req.bond = Math.max(0, Math.round(raw.bond));
  }
  if (Array.isArray(raw.items)) {
    req.items = raw.items
      .filter((entry): entry is { key: string; qty: number } =>
        isRecord(entry) && typeof entry.key === 'string' && typeof entry.qty === 'number'
      )
      .map(entry => ({ key: entry.key, qty: Math.max(1, Math.round(entry.qty)) }));
  }
  return req;
}

export async function grantPetExperience(
  client: PrismaClientOrTx | undefined,
  userPetId: number,
  amount: number
) {
  if (amount <= 0) return null;
  const prismaClient = getClient(client);
  const pet = await prismaClient.userPet.findUnique({ where: { id: userPetId } });
  if (!pet) return null;
  let xp = pet.xp + amount;
  let level = pet.level;
  let leveled = false;
  while (level < PET_LEVEL_CAP && xp >= petXpToNext(level)) {
    xp -= petXpToNext(level);
    level += 1;
    leveled = true;
  }
  if (level >= PET_LEVEL_CAP) {
    xp = Math.min(xp, petXpToNext(level));
  }
  await prismaClient.userPet.update({ where: { id: userPetId }, data: { xp, level } });
  return { xp, level, leveled };
}

export function clampPetGauge(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}
