import { prisma } from '../lib/db.js';
import { buildPlayerCombatant } from './combat.js';
import { grantExperience } from './progression.js';
import { getActiveBossOverrides, getGlobalModifierSnapshot } from './globalEvents.js';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const BOSS_ROTATION = [
  { key: 'titan_ferreo', name: 'Titán Férrero', baseHp: 20000, attack: 220, defense: 60 },
  { key: 'reina_astral', name: 'Reina Astral', baseHp: 23000, attack: 200, defense: 75 },
  { key: 'devorador', name: 'Devorador del Vacío', baseHp: 26000, attack: 250, defense: 70 },
];

const SPECIAL_BOSSES: Record<string, { name: string; baseHp: number; attack: number; defense: number }> = {
  ancient_dragon: { name: 'Dragón Ancestral', baseHp: 32000, attack: 320, defense: 90 },
  pumpkin_king: { name: 'Rey Calabaza', baseHp: 18000, attack: 180, defense: 55 },
  abyssal_kraken: { name: 'Kraken Abisal', baseHp: 28000, attack: 260, defense: 80 },
};

export function getCurrentRotationWeek(timestamp = Date.now()) {
  return Math.floor(timestamp / WEEK_MS);
}

export async function ensureWeeklyBoss() {
  const rotationWeek = getCurrentRotationWeek();
  let boss = await prisma.boss.findUnique({ where: { rotationWeek } });
  const modifiers = await getGlobalModifierSnapshot();
  const overrides = getActiveBossOverrides(modifiers);
  const activeOverride = overrides[0];
  const overrideTemplate = activeOverride ? SPECIAL_BOSSES[activeOverride.spawn] : undefined;

  if (boss) {
    if (overrideTemplate) {
      const meta = (boss.metadata ?? {}) as Record<string, any>;
      if (meta.eventSpawn !== activeOverride?.spawn) {
        boss = await prisma.boss.update({
          where: { id: boss.id },
          data: {
            name: overrideTemplate.name,
            hp: overrideTemplate.baseHp,
            maxHp: overrideTemplate.baseHp,
            metadata: {
              ...meta,
              key: activeOverride.spawn,
              attack: overrideTemplate.attack,
              defense: overrideTemplate.defense,
              eventSpawn: activeOverride.spawn,
            },
          },
        });
      }
    }
    return boss;
  }

  const rotationTemplate = BOSS_ROTATION[rotationWeek % BOSS_ROTATION.length];
  const template = overrideTemplate
    ? { key: activeOverride!.spawn, name: overrideTemplate.name, baseHp: overrideTemplate.baseHp, attack: overrideTemplate.attack, defense: overrideTemplate.defense }
    : rotationTemplate;

  boss = await prisma.boss.create({
    data: {
      name: template.name,
      rotationWeek,
      hp: template.baseHp,
      maxHp: template.baseHp,
      metadata: {
        key: template.key,
        attack: template.attack,
        defense: template.defense,
        eventSpawn: overrideTemplate ? activeOverride?.spawn : undefined,
      },
    },
  });
  return boss;
}

export async function getBossWithDamage() {
  const boss = await ensureWeeklyBoss();
  const damages = await prisma.bossDamage.findMany({
    where: { bossId: boss.id },
    orderBy: { damage: 'desc' },
    take: 10,
    include: { user: true },
  });
  return { boss, damages };
}

function computeBossDamage(playerAttack: number, bossDefense: number) {
  const mitigated = playerAttack - bossDefense * 0.35;
  return Math.max(5, Math.round(mitigated));
}

export async function attackBoss(userId: string) {
  const boss = await ensureWeeklyBoss();
  if (boss.hp <= 0) {
    return { boss, damage: 0, defeated: true } as const;
  }

  const meta = (boss.metadata ?? {}) as Record<string, any>;
  const overrideKey = typeof meta.eventSpawn === 'string' ? meta.eventSpawn : null;
  const template = overrideKey && SPECIAL_BOSSES[overrideKey]
    ? { key: overrideKey, ...SPECIAL_BOSSES[overrideKey] }
    : BOSS_ROTATION[boss.rotationWeek % BOSS_ROTATION.length];
  const player = await buildPlayerCombatant(userId);
  if (!player) throw new Error('Usuario inexistente.');

  const defense = typeof meta.defense === 'number' ? meta.defense : template.defense;
  const damage = computeBossDamage(player.attack + (player.strength ?? 0) * 2, defense);
  const critChance = Math.min(0.55, player.critChance + player.luck * 0.02);
  const crit = Math.random() < critChance;
  const dealt = crit ? Math.round(damage * 1.7) : damage;

  const hp = Math.max(0, boss.hp - dealt);
  const updated = await prisma.boss.update({ where: { id: boss.id }, data: { hp } });

  await prisma.bossDamage.upsert({
    where: { bossId_userId: { bossId: boss.id, userId } },
    create: { bossId: boss.id, userId, damage: dealt },
    update: { damage: { increment: dealt }, lastAttackAt: new Date() },
  });

  await prisma.user.update({ where: { id: userId }, data: { vcoins: { increment: Math.round(dealt / 10) } } });
  await grantExperience(userId, Math.max(10, Math.round(dealt / 5)));

  return { boss: updated, damage: dealt, crit, defeated: hp <= 0 } as const;
}

