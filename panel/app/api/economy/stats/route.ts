import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { handleApiError, requireSession } from '@/lib/api-helpers';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireSession();

    const [userCount, vcoinAggregate, marketDay, marketWeek, activeEvents, bossProgress] = await Promise.all([
      prisma.user.count(),
      prisma.user.aggregate({ _sum: { vcoins: true } }),
      prisma.marketTx.aggregate({
        _sum: { price: true },
        where: { createdAt: { gte: new Date(Date.now() - 1000 * 60 * 60 * 24) } },
      }),
      prisma.marketTx.aggregate({
        _sum: { price: true },
        where: { createdAt: { gte: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7) } },
      }),
      prisma.event.count({ where: { isActive: true } }),
      prisma.boss.findFirst({ orderBy: { createdAt: 'desc' } }).catch(() => null),
    ]);

    return NextResponse.json({
      users: userCount,
      totalVCoins: vcoinAggregate._sum.vcoins ?? 0,
      marketVolume: {
        daily: marketDay._sum.price ?? 0,
        weekly: marketWeek._sum.price ?? 0,
      },
      activeEvents,
      bossProgress: bossProgress
        ? {
            name: bossProgress.name,
            health: bossProgress.hp,
            healthMax: bossProgress.maxHp,
          }
        : null,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
