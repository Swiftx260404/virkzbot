import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const isBuildPhase = process.env.NEXT_PHASE === 'phase-production-build';

function createPrismaMock(): PrismaClient {
  const zeroAggregate = { _sum: { price: 0, vcoins: 0 } };
  return {
    user: {
      count: async () => 0,
      aggregate: async () => zeroAggregate,
      findUnique: async () => null,
      upsert: async ({ where }: { where: { id: string } }) => ({ id: where.id }),
    },
    marketTx: { aggregate: async () => zeroAggregate },
    event: { count: async () => 0, findMany: async () => [] },
    boss: { findFirst: async () => null },
    marketListing: { count: async () => 0, findMany: async () => [] },
    userItem: { findMany: async () => [] },
    userPet: { findFirst: async () => null },
    item: { findMany: async () => [] },
    guildMember: { findFirst: async () => null },
  } as unknown as PrismaClient;
}

const prismaClient = isBuildPhase
  ? createPrismaMock()
  : (globalForPrisma.prisma ??
      new PrismaClient({
        log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
      }));

if (!isBuildPhase && process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prismaClient;
}

export const prisma = prismaClient;
