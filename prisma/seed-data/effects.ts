import { PrismaClient, EffectTarget, EffectType } from '@prisma/client';
import itemsJson from '../../src/data/items.json' assert { type: 'json' };

type RawItem = {
  key: string;
  type: string;
  metadata?: Record<string, any>;
};

const items = itemsJson as RawItem[];

type EffectConfig = {
  itemKey: string;
  type: EffectType;
  target: EffectTarget;
  magnitude: number;
  durationSec?: number | null;
  metadata?: Record<string, unknown>;
};

const mapEffect = (item: RawItem): EffectConfig | null => {
  const meta = item.metadata ?? {};
  const effectKey: string | undefined = meta.effect ?? (typeof meta.dropBonus === 'number' ? 'drop_bonus' : undefined);
  if (!effectKey) return null;

  const value: number = typeof meta.value === 'number' ? meta.value : (typeof meta.dropBonus === 'number' ? meta.dropBonus : 0);
  const duration: number | undefined = typeof meta.durationSec === 'number' ? meta.durationSec : undefined;

  switch (effectKey) {
    case 'heal':
      return { itemKey: item.key, type: EffectType.HEAL, target: EffectTarget.SELF, magnitude: value };
    case 'heal_over_time':
      return {
        itemKey: item.key,
        type: EffectType.HEAL,
        target: EffectTarget.SELF,
        magnitude: value,
        durationSec: duration ?? 600,
        metadata: { overTime: true },
      };
    case 'energy':
    case 'stamina':
      return { itemKey: item.key, type: EffectType.ENERGY, target: EffectTarget.SELF, magnitude: value };
    case 'luck':
      return {
        itemKey: item.key,
        type: EffectType.BUFF_LUCK,
        target: EffectTarget.SELF,
        magnitude: value,
        durationSec: duration ?? 900,
      };
    case 'focus':
    case 'crit':
    case 'shadow_crit':
      return {
        itemKey: item.key,
        type: EffectType.BUFF_CRIT,
        target: EffectTarget.SELF,
        magnitude: value,
        durationSec: duration ?? 1200,
      };
    case 'mine_yield':
      return {
        itemKey: item.key,
        type: EffectType.BUFF_RESOURCE_YIELD,
        target: EffectTarget.TOOL,
        magnitude: value,
        durationSec: duration ?? 900,
        metadata: { appliesTo: ['PICKAXE', 'MINE'] },
      };
    case 'fish_yield':
      return {
        itemKey: item.key,
        type: EffectType.BUFF_RESOURCE_YIELD,
        target: EffectTarget.TOOL,
        magnitude: value,
        durationSec: duration ?? 900,
        metadata: { appliesTo: ['ROD', 'FISH'] },
      };
    case 'attack':
      return {
        itemKey: item.key,
        type: EffectType.BUFF_ATTACK,
        target: EffectTarget.SELF,
        magnitude: value,
        durationSec: duration ?? 600,
      };
    case 'defense':
    case 'damage_reduce':
      return {
        itemKey: item.key,
        type: EffectType.BUFF_DEFENSE,
        target: EffectTarget.SELF,
        magnitude: value,
        durationSec: duration ?? 600,
      };
    case 'party_buff':
      return {
        itemKey: item.key,
        type: EffectType.BUFF_ATTACK,
        target: EffectTarget.SELF,
        magnitude: value,
        durationSec: duration ?? 1800,
        metadata: { scope: 'party' },
      };
    case 'intellect':
      return {
        itemKey: item.key,
        type: EffectType.BUFF_ATTACK,
        target: EffectTarget.SELF,
        magnitude: value,
        durationSec: duration ?? 1800,
        metadata: { attribute: 'intellect' },
      };
    case 'max_health':
      return {
        itemKey: item.key,
        type: EffectType.SHIELD,
        target: EffectTarget.SELF,
        magnitude: value,
        durationSec: duration ?? 1800,
      };
    case 'work_reward':
      return {
        itemKey: item.key,
        type: EffectType.BUFF_WORK_PAYOUT,
        target: EffectTarget.SELF,
        magnitude: value,
        durationSec: duration ?? 1800,
      };
    case 'skill_xp':
      return {
        itemKey: item.key,
        type: EffectType.BUFF_WORK_PAYOUT,
        target: EffectTarget.SELF,
        magnitude: value,
        durationSec: duration ?? 1800,
        metadata: { appliesTo: 'SKILL' },
      };
    case 'mine_speed':
      return {
        itemKey: item.key,
        type: EffectType.BUFF_RESOURCE_YIELD,
        target: EffectTarget.TOOL,
        magnitude: value,
        durationSec: duration ?? 1200,
        metadata: { appliesTo: ['PICKAXE', 'SPEED'] },
      };
    case 'fish_speed':
      return {
        itemKey: item.key,
        type: EffectType.BUFF_RESOURCE_YIELD,
        target: EffectTarget.TOOL,
        magnitude: value,
        durationSec: duration ?? 1200,
        metadata: { appliesTo: ['ROD', 'SPEED'] },
      };
    case 'boss_damage':
      return {
        itemKey: item.key,
        type: EffectType.BUFF_ATTACK,
        target: EffectTarget.WEAPON,
        magnitude: value,
        durationSec: duration ?? 900,
        metadata: { appliesTo: 'BOSS' },
      };
    case 'drop_bonus':
      return {
        itemKey: item.key,
        type: EffectType.BUFF_DROP_RATE,
        target: EffectTarget.TOOL,
        magnitude: typeof meta.dropBonus === 'number' ? meta.dropBonus : value,
        durationSec: duration ?? 1800,
        metadata: { appliesTo: ['ROD', 'FISH'] },
      };
    case 'aggro_reduce':
      return {
        itemKey: item.key,
        type: EffectType.BUFF_DEFENSE,
        target: EffectTarget.SELF,
        magnitude: value,
        durationSec: duration ?? 900,
        metadata: { reducesAggro: true },
      };
    case 'attack_speed':
      return {
        itemKey: item.key,
        type: EffectType.BUFF_ATTACK,
        target: EffectTarget.SELF,
        magnitude: value,
        durationSec: duration ?? 900,
        metadata: { attribute: 'speed' },
      };
    case 'fish_spawn':
      return {
        itemKey: item.key,
        type: EffectType.BUFF_DROP_RATE,
        target: EffectTarget.TOOL,
        magnitude: value,
        durationSec: duration ?? 900,
        metadata: { appliesTo: ['ROD', 'FISH'], behavior: 'spawn' },
      };
    case 'mine_buff':
      return {
        itemKey: item.key,
        type: EffectType.BUFF_RESOURCE_YIELD,
        target: EffectTarget.TOOL,
        magnitude: value,
        durationSec: duration ?? null,
        metadata: { appliesTo: ['PICKAXE', 'MINE'], passive: true },
      };
    case 'fish_buff':
      return {
        itemKey: item.key,
        type: EffectType.BUFF_RESOURCE_YIELD,
        target: EffectTarget.TOOL,
        magnitude: value,
        durationSec: duration ?? null,
        metadata: { appliesTo: ['ROD', 'FISH'], passive: true },
      };
    case 'regen':
      return {
        itemKey: item.key,
        type: EffectType.HEAL,
        target: EffectTarget.SELF,
        magnitude: value,
        durationSec: duration ?? 600,
        metadata: { overTime: true },
      };
    case 'speed':
      return {
        itemKey: item.key,
        type: EffectType.BUFF_ATTACK,
        target: EffectTarget.SELF,
        magnitude: value,
        durationSec: duration ?? 900,
        metadata: { attribute: 'speed' },
      };
    case 'fish_drop':
      return {
        itemKey: item.key,
        type: EffectType.BUFF_DROP_RATE,
        target: EffectTarget.TOOL,
        magnitude: value,
        durationSec: duration ?? 600,
        metadata: { appliesTo: ['ROD', 'FISH'] },
      };
    default:
      return null;
  }
};

export async function seedEffects(prisma: PrismaClient, itemIds: Map<string, number>) {
  for (const item of items) {
    const effect = mapEffect(item);
    if (!effect) continue;

    const itemId = itemIds.get(item.key);
    if (!itemId) continue;

    await prisma.itemEffect.deleteMany({ where: { itemId } });
    await prisma.itemEffect.create({
      data: {
        itemId,
        type: effect.type,
        target: effect.target,
        magnitude: effect.magnitude,
        durationSec: effect.durationSec ?? null,
        metadata: effect.metadata ?? null,
      },
    });
  }
}
