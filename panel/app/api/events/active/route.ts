import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { handleApiError, requireSession } from '@/lib/api-helpers';

export const dynamic = 'force-dynamic';

type ApiEvent = {
  id: number;
  name: string;
  description: string;
  startDate: Date;
  endDate: Date;
  isActive: boolean;
};

export async function GET() {
  try {
    await requireSession();

    const events = (await prisma.event.findMany({
      where: { endDate: { gte: new Date() } },
      orderBy: { startDate: 'asc' },
    })) as ApiEvent[];

    return NextResponse.json(
      events.map((event) => ({
        id: event.id,
        name: event.name,
        description: event.description,
        startDate: event.startDate,
        endDate: event.endDate,
        isActive: event.isActive,
      })),
    );
  } catch (error) {
    return handleApiError(error);
  }
}
