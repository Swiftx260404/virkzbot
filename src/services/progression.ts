import { prisma } from '../lib/db.js';
import { getGlobalModifierSnapshot, getXpMultiplier } from './globalEvents.js';

export const BASE_ATTRIBUTES = {
  strength: 1,
  agility: 1,
  intellect: 1,
  luck: 1,
} as const;

export type AttributeKey = keyof typeof BASE_ATTRIBUTES;

export function xpToNext(level: number) {
  return Math.max(50, level * level * 100);
}

export async function grantExperience(userId: string, amount: number) {
  if (amount <= 0) {
    return null;
  }

  const modifiers = await getGlobalModifierSnapshot();
  const xpMultiplier = getXpMultiplier(modifiers);
  const adjusted = Math.max(0, Math.round(amount * xpMultiplier));
  if (adjusted <= 0) {
    return null;
  }
  amount = adjusted;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      xp: true,
      level: true,
      skillPoints: true,
    },
  });

  if (!user) return null;

  let { xp, level, skillPoints } = user;
  xp += amount;
  let levelsGained = 0;
  let skillPointsEarned = 0;

  while (xp >= xpToNext(level)) {
    xp -= xpToNext(level);
    level += 1;
    levelsGained += 1;
    skillPointsEarned += 3;
  }

  if (levelsGained > 0) {
    skillPoints += skillPointsEarned;
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      xp,
      level,
      skillPoints,
    },
  });

  return {
    xp,
    level,
    skillPoints,
    levelsGained,
    skillPointsEarned,
  };
}

export function buildAttributeSummary(user: {
  strength: number;
  agility: number;
  intellect: number;
  luck: number;
}) {
  return `💪 Fuerza: ${user.strength}\n🏹 Agilidad: ${user.agility}\n✨ Intelecto: ${user.intellect}\n🍀 Suerte: ${user.luck}`;
}

export function computeCritChance(base: number, luck: number) {
  const extra = luck * 0.01;
  return Math.min(0.6, base + extra);
}

export function computeDodgeChance(agility: number) {
  return Math.min(0.35, 0.02 + agility * 0.005);
}

export function computeBonusDamage(strength: number, intellect: number) {
  return strength * 2 + intellect;
}

