import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { handleApiError, requireSession } from '@/lib/api-helpers';

export const dynamic = 'force-dynamic';

type MyListing = {
  id: number;
  itemName: string;
  qty: number;
  remainingQty: number;
  price: number;
  status: string;
  createdAt: Date;
  item: { name: string };
};

export async function GET() {
  try {
    const session = await requireSession();

    const listings = (await prisma.marketListing.findMany({
      where: {
        sellerId: session.user?.id,
        status: 'ACTIVE',
      },
      include: {
        item: true,
      },
      orderBy: { createdAt: 'desc' },
    })) as MyListing[];

    return NextResponse.json(
      listings.map((listing) => ({
        id: listing.id,
        itemName: listing.item.name,
        qty: listing.qty,
        remainingQty: listing.remainingQty,
        price: listing.price,
        status: listing.status,
        createdAt: listing.createdAt,
      })),
    );
  } catch (error) {
    return handleApiError(error);
  }
}
