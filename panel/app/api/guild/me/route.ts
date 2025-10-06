import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { handleApiError, requireSession } from '@/lib/api-helpers';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await requireSession();
    const userId = session.user?.id as string;

    const membership = await prisma.guildMember.findFirst({
      where: { userId, status: 'ACTIVE' },
      include: {
        guild: {
          include: {
            leader: { select: { id: true } },
            upgrades: true,
            members: {
              select: { userId: true, role: true },
            },
          },
        },
      },
    });

    if (!membership) {
      return NextResponse.json(null);
    }

    return NextResponse.json({
      guild: {
        id: membership.guild.id,
        name: membership.guild.name,
        description: membership.guild.description,
        bankCoins: membership.guild.bankCoins,
        leaderId: membership.guild.leaderId,
        capacity: membership.guild.capacity,
        upgrades: membership.guild.upgrades.map(({ id, type, level }: { id: number; type: string; level: number }) => ({
          id,
          type,
          level,
        })),
        members: membership.guild.members.length,
      },
      role: membership.role,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
