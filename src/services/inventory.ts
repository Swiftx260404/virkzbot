import type { PrismaClient, Prisma } from '@prisma/client';
import { prisma } from '../lib/db.js';
import { getGuildBonusesForUser } from './guilds.js';

export const BASE_INVENTORY_CAPACITY = 100;

type PrismaClientOrTx = PrismaClient | Prisma.TransactionClient;

function getClient(client?: PrismaClientOrTx) {
  return client ?? prisma;
}

export async function getInventoryUsage(userId: string, client?: PrismaClientOrTx) {
  const prismaClient = getClient(client);
  const result = await prismaClient.userItem.aggregate({
    where: { userId },
    _sum: { quantity: true }
  });
  return result._sum.quantity ?? 0;
}

export async function getInventoryCapacity(userId: string, client?: PrismaClientOrTx) {
  const bonuses = await getGuildBonusesForUser(userId, client);
  return BASE_INVENTORY_CAPACITY + Math.round(bonuses.inventoryCapacity ?? 0);
}

export async function ensureInventoryCapacity(
  client: PrismaClientOrTx | undefined,
  userId: string,
  additionalQuantity: number
) {
  if (additionalQuantity <= 0) return;
  const prismaClient = getClient(client);
  const [capacity, usage] = await Promise.all([
    getInventoryCapacity(userId, prismaClient),
    getInventoryUsage(userId, prismaClient)
  ]);
  if (usage + additionalQuantity > capacity) {
    throw new Error('INVENTORY_FULL');
  }
}

