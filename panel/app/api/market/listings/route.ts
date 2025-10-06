import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { handleApiError, requireSession } from '@/lib/api-helpers';

export const dynamic = 'force-dynamic';

type ListingWithItem = {
  id: number;
  itemId: number;
  qty: number;
  remainingQty: number;
  price: number;
  status: string;
  createdAt: Date;
  sellerId: string;
  item: {
    name: string;
    type: string;
    rarity: string;
  };
};

export async function GET(request: NextRequest) {
  try {
    await requireSession();

    const { searchParams } = new URL(request.url);
    const page = Number(searchParams.get('page') ?? '1');
    const pageSize = Math.min(Number(searchParams.get('pageSize') ?? '10'), 50);
    const search = searchParams.get('search')?.trim();
    const category = searchParams.get('category')?.trim();

    const where: any = {
      status: 'ACTIVE',
      remainingQty: { gt: 0 },
    };

    const itemFilters: Array<Record<string, unknown>> = [];
    if (search) {
      itemFilters.push({
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { key: { contains: search, mode: 'insensitive' } },
        ],
      });
    }
    if (category) {
      itemFilters.push({ type: category as any });
    }
    if (itemFilters.length > 0) {
      where.item = { AND: itemFilters };
    }

    const [total, listings] = (await Promise.all([
      prisma.marketListing.count({ where }),
      prisma.marketListing.findMany({
        where,
        include: {
          item: true,
          seller: { select: { id: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ])) as [number, ListingWithItem[]];

    return NextResponse.json({
      page,
      pageSize,
      total,
      listings: listings.map((listing) => ({
        id: listing.id,
        itemId: listing.itemId,
        itemName: listing.item.name,
        itemType: listing.item.type,
        rarity: listing.item.rarity,
        qty: listing.qty,
        remainingQty: listing.remainingQty,
        price: listing.price,
        status: listing.status,
        createdAt: listing.createdAt,
        sellerId: listing.sellerId,
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
