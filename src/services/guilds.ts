import {
  Guild,
  GuildMember,
  GuildUpgrade,
  GuildUpgradeType,
  GuildRole,
  Prisma,
  PrismaClient
} from '@prisma/client';
import { prisma } from '../lib/db.js';

export const DEFAULT_GUILD_CAPACITY = 20;

export interface GuildUpgradeLevel {
  cost: number;
  bonus: number;
  label: string;
}

export interface GuildUpgradeDefinition {
  type: GuildUpgradeType;
  label: string;
  levels: GuildUpgradeLevel[];
  unit: 'percent' | 'flat';
}

type PrismaClientOrTx = PrismaClient | Prisma.TransactionClient;

function getClient(client?: PrismaClientOrTx) {
  return client ?? prisma;
}

export const GUILD_UPGRADE_CONFIG: Record<GuildUpgradeType, GuildUpgradeDefinition> = {
  [GuildUpgradeType.DROP_RATE]: {
    type: GuildUpgradeType.DROP_RATE,
    label: 'Probabilidad de drop',
    unit: 'percent',
    levels: [
      { cost: 5_000, bonus: 0.05, label: '+5% a drops' },
      { cost: 15_000, bonus: 0.1, label: '+10% a drops' },
      { cost: 35_000, bonus: 0.2, label: '+20% a drops' }
    ]
  },
  [GuildUpgradeType.INVENTORY_CAPACITY]: {
    type: GuildUpgradeType.INVENTORY_CAPACITY,
    label: 'Capacidad de inventario',
    unit: 'flat',
    levels: [
      { cost: 4_000, bonus: 20, label: '+20 espacios de inventario' },
      { cost: 12_000, bonus: 45, label: '+45 espacios de inventario' },
      { cost: 28_000, bonus: 80, label: '+80 espacios de inventario' }
    ]
  }
};

export interface GuildBonusSummary {
  dropRate: number;
  inventoryCapacity: number;
}

export interface GuildContext {
  guild: Guild;
  member: GuildMember;
  bonuses: GuildBonusSummary;
}

export function isGuildOfficer(member: Pick<GuildMember, 'role'> | null | undefined) {
  if (!member) return false;
  return member.role === GuildRole.LEADER || member.role === GuildRole.OFFICER;
}

export function computeGuildBonuses(upgrades: GuildUpgrade[]): GuildBonusSummary {
  let dropRate = 0;
  let inventoryCapacity = 0;
  for (const upgrade of upgrades) {
    const def = GUILD_UPGRADE_CONFIG[upgrade.type];
    if (!def) continue;
    const levelIndex = Math.min(Math.max(upgrade.level, 1), def.levels.length) - 1;
    const level = def.levels[levelIndex];
    if (!level) continue;
    if (upgrade.type === GuildUpgradeType.DROP_RATE) {
      dropRate += level.bonus;
    } else if (upgrade.type === GuildUpgradeType.INVENTORY_CAPACITY) {
      inventoryCapacity += level.bonus;
    }
  }
  return { dropRate, inventoryCapacity };
}

export async function getGuildContextForUser(
  userId: string,
  client?: PrismaClientOrTx
): Promise<GuildContext | null> {
  const prismaClient = getClient(client);
  const membership = await prismaClient.guildMember.findFirst({
    where: { userId, status: 'ACTIVE' },
    include: {
      guild: {
        include: {
          upgrades: true
        }
      }
    }
  });
  if (!membership || !membership.guild) {
    return null;
  }
  const bonuses = computeGuildBonuses(membership.guild.upgrades ?? []);
  return { guild: membership.guild, member: membership, bonuses };
}

export async function getGuildBonusesForUser(
  userId: string,
  client?: PrismaClientOrTx
): Promise<GuildBonusSummary> {
  const ctx = await getGuildContextForUser(userId, client);
  if (!ctx) {
    return { dropRate: 0, inventoryCapacity: 0 };
  }
  return ctx.bonuses;
}

export function describeUpgradeLevel(type: GuildUpgradeType, level: number) {
  const def = GUILD_UPGRADE_CONFIG[type];
  if (!def) return '—';
  if (level <= 0) return 'Sin mejora';
  const idx = Math.min(level, def.levels.length) - 1;
  const entry = def.levels[idx];
  if (!entry) return 'Sin mejora';
  if (def.unit === 'percent') {
    return `${Math.round(entry.bonus * 100)}%`;
  }
  return `${entry.bonus}`;
}

export function nextUpgradeInfo(type: GuildUpgradeType, level: number) {
  const def = GUILD_UPGRADE_CONFIG[type];
  if (!def) return null;
  if (level >= def.levels.length) return null;
  const entry = def.levels[level];
  return entry;
}

