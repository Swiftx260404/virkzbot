import { prisma } from '../lib/db.js';

export type EventDropDefinition = {
  itemKey: string;
  chance: number;
  qtyMin: number;
  qtyMax: number;
  commands?: string[];
  tags?: string[];
  templateKey?: string;
  eventName?: string;
};

export interface GlobalModifierSnapshot {
  updatedAt: string;
  activeEvents: Array<{
    templateKey: string;
    name: string;
    description: string;
    startDate: string;
    endDate: string;
    bonuses?: Record<string, unknown> | null;
    drops?: unknown;
  }>;
  aggregates: {
    economy: {
      globalMultiplier: number;
      commands: Record<string, number>;
      globalFlat: number;
      flat: Record<string, number>;
    };
    drop: {
      multiplier: number;
      tags: string[];
      flatChance: number;
    };
    xp: {
      multiplier: number;
    };
    fishing: {
      multiplier: number;
    };
    craft: {
      costMultiplier: number;
      qualityMultiplier: number;
    };
    bosses: Array<{ spawn: string; templateKey: string; name: string }>;
    eventDrops: EventDropDefinition[];
    other: Record<string, unknown>;
  };
}

const EMPTY_SNAPSHOT: GlobalModifierSnapshot = {
  updatedAt: new Date(0).toISOString(),
  activeEvents: [],
  aggregates: {
    economy: { globalMultiplier: 1, commands: {}, globalFlat: 0, flat: {} },
    drop: { multiplier: 1, tags: [], flatChance: 0 },
    xp: { multiplier: 1 },
    fishing: { multiplier: 1 },
    craft: { costMultiplier: 1, qualityMultiplier: 1 },
    bosses: [],
    eventDrops: [],
    other: {},
  },
};

let cache: GlobalModifierSnapshot = EMPTY_SNAPSHOT;
let cacheAt = 0;
const CACHE_TTL = 10_000;

function normalizeSnapshot(value: any): GlobalModifierSnapshot {
  if (!value || typeof value !== 'object') {
    return structuredClone(EMPTY_SNAPSHOT);
  }

  const aggregates = (value as GlobalModifierSnapshot).aggregates ?? {};
  const economy = aggregates.economy ?? {};
  const drop = aggregates.drop ?? {};
  const xp = aggregates.xp ?? {};
  const fishing = aggregates.fishing ?? {};
  const craft = aggregates.craft ?? {};
  const bosses = Array.isArray(aggregates.bosses) ? aggregates.bosses : [];
  const eventDrops = Array.isArray(aggregates.eventDrops) ? aggregates.eventDrops : [];
  const other = aggregates.other ?? {};

  return {
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : new Date().toISOString(),
    activeEvents: Array.isArray(value.activeEvents) ? value.activeEvents : [],
    aggregates: {
      economy: {
        globalMultiplier: typeof economy.globalMultiplier === 'number' && Number.isFinite(economy.globalMultiplier)
          ? Math.max(0, economy.globalMultiplier)
          : 1,
        commands: typeof economy.commands === 'object' && economy.commands !== null ? { ...economy.commands } : {},
        globalFlat: typeof economy.globalFlat === 'number' && Number.isFinite(economy.globalFlat)
          ? economy.globalFlat
          : 0,
        flat: typeof economy.flat === 'object' && economy.flat !== null ? { ...economy.flat } : {},
      },
      drop: {
        multiplier: typeof drop.multiplier === 'number' && Number.isFinite(drop.multiplier) ? Math.max(0, drop.multiplier) : 1,
        tags: Array.isArray(drop.tags) ? drop.tags.map(String) : [],
        flatChance: typeof drop.flatChance === 'number' && Number.isFinite(drop.flatChance) ? drop.flatChance : 0,
      },
      xp: {
        multiplier: typeof xp.multiplier === 'number' && Number.isFinite(xp.multiplier) ? Math.max(0, xp.multiplier) : 1,
      },
      fishing: {
        multiplier:
          typeof fishing.multiplier === 'number' && Number.isFinite(fishing.multiplier)
            ? Math.max(0, fishing.multiplier)
            : 1,
      },
      craft: {
        costMultiplier:
          typeof craft.costMultiplier === 'number' && Number.isFinite(craft.costMultiplier)
            ? Math.max(0, craft.costMultiplier)
            : 1,
        qualityMultiplier:
          typeof craft.qualityMultiplier === 'number' && Number.isFinite(craft.qualityMultiplier)
            ? Math.max(0, craft.qualityMultiplier)
            : 1,
      },
      bosses: bosses.map((boss) => ({
        spawn: String(boss.spawn ?? ''),
        templateKey: String(boss.templateKey ?? ''),
        name: String(boss.name ?? ''),
      })).filter((boss) => boss.spawn.length > 0),
      eventDrops: eventDrops.map((drop) => ({
        itemKey: String(drop.itemKey ?? ''),
        chance: Number(drop.chance ?? 0),
        qtyMin: Number(drop.qtyMin ?? 1),
        qtyMax: Number(drop.qtyMax ?? 1),
        commands: Array.isArray(drop.commands) ? drop.commands.map(String) : undefined,
        tags: Array.isArray(drop.tags) ? drop.tags.map(String) : undefined,
        templateKey: typeof drop.templateKey === 'string' ? drop.templateKey : undefined,
        eventName: typeof drop.eventName === 'string' ? drop.eventName : undefined,
      })).filter((drop) => drop.itemKey.length > 0 && drop.chance > 0),
      other,
    },
  } satisfies GlobalModifierSnapshot;
}

export function setGlobalModifierSnapshot(snapshot: GlobalModifierSnapshot) {
  cache = snapshot;
  cacheAt = Date.now();
}

export async function getGlobalModifierSnapshot(force = false): Promise<GlobalModifierSnapshot> {
  if (!force && cache && Date.now() - cacheAt < CACHE_TTL) {
    return cache;
  }
  const record = await prisma.globalModifier.findUnique({ where: { id: 1 } });
  if (!record) {
    cache = structuredClone(EMPTY_SNAPSHOT);
    cache.updatedAt = new Date().toISOString();
    cacheAt = Date.now();
    return cache;
  }
  cache = normalizeSnapshot(record.data ?? {});
  cacheAt = Date.now();
  return cache;
}

export function computeEconomyMultiplier(snapshot: GlobalModifierSnapshot, command?: string) {
  const base = snapshot.aggregates.economy.globalMultiplier || 1;
  if (!command) return base;
  const perCommand = snapshot.aggregates.economy.commands[command];
  return base * (perCommand ?? 1);
}

export function computeEconomyFlat(snapshot: GlobalModifierSnapshot, command?: string) {
  const base = snapshot.aggregates.economy.globalFlat || 0;
  if (!command) return base;
  return base + (snapshot.aggregates.economy.flat[command] ?? 0);
}

export function applyEconomyModifier(
  base: number,
  command: string,
  snapshot?: GlobalModifierSnapshot
): { value: number; multiplier: number; flat: number } {
  const snap = snapshot ?? cache;
  const multiplier = computeEconomyMultiplier(snap, command);
  const flat = computeEconomyFlat(snap, command);
  const value = Math.max(0, Math.round(base * multiplier + flat));
  return { value, multiplier, flat };
}

export function getDropMultiplier(snapshot: GlobalModifierSnapshot) {
  return snapshot.aggregates.drop.multiplier || 1;
}

export function getXpMultiplier(snapshot: GlobalModifierSnapshot) {
  return snapshot.aggregates.xp.multiplier || 1;
}

export function getFishingMultiplier(snapshot: GlobalModifierSnapshot) {
  return snapshot.aggregates.fishing.multiplier || 1;
}

export function getCraftCostMultiplier(snapshot: GlobalModifierSnapshot) {
  return snapshot.aggregates.craft.costMultiplier || 1;
}

export function getCraftQualityMultiplier(snapshot: GlobalModifierSnapshot) {
  return snapshot.aggregates.craft.qualityMultiplier || 1;
}

export function getEventDropsForCommand(command: string, snapshot?: GlobalModifierSnapshot) {
  const snap = snapshot ?? cache;
  return snap.aggregates.eventDrops.filter((drop) => {
    if (!drop.commands || drop.commands.length === 0) return true;
    return drop.commands.includes(command);
  });
}

export function getActiveBossOverrides(snapshot?: GlobalModifierSnapshot) {
  const snap = snapshot ?? cache;
  return snap.aggregates.bosses;
}

export function resetGlobalModifierCache() {
  cacheAt = 0;
}

export function createEmptyModifierSnapshot(): GlobalModifierSnapshot {
  return structuredClone(EMPTY_SNAPSHOT);
}
