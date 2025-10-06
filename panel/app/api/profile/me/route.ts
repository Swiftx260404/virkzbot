import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { handleApiError, requireSession } from '@/lib/api-helpers';

export const dynamic = 'force-dynamic';

type InventoryEntry = {
  id: number;
  itemId: number;
  quantity: number;
  item: { name: string; rarity: string };
};

export async function GET() {
  try {
    const session = await requireSession();
    const userId = session.user?.id as string;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        vcoins: true,
        level: true,
        xp: true,
        attack: true,
        defense: true,
        energy: true,
        strength: true,
        agility: true,
        intellect: true,
        luck: true,
        equippedWeaponId: true,
        equippedArmorId: true,
        equippedPickaxeId: true,
        equippedRodId: true,
      },
    });

    if (!user) {
      throw new Response('Not found', { status: 404 });
    }

    const [topItemsRaw, activePet] = await Promise.all([
      prisma.userItem.findMany({
        where: { userId },
        include: { item: true },
        orderBy: { quantity: 'desc' },
        take: 6,
      }),
      prisma.userPet.findFirst({
        where: { userId, active: true },
        include: { pet: true },
      }),
    ]);

    const topItems = topItemsRaw as InventoryEntry[];

    const equipmentIds = [
      user.equippedWeaponId,
      user.equippedArmorId,
      user.equippedPickaxeId,
      user.equippedRodId,
    ].filter((value): value is number => typeof value === 'number');

    let equipmentRecords: Array<{ id: number; name: string; type: string; rarity: string }> = [];
    if (equipmentIds.length > 0) {
      equipmentRecords = await prisma.item.findMany({
        where: { id: { in: equipmentIds } },
        select: { id: true, name: true, type: true, rarity: true },
      });
    }

    const equipment = {
      weapon: equipmentRecords.find((item) => item.id === user.equippedWeaponId) ?? null,
      armor: equipmentRecords.find((item) => item.id === user.equippedArmorId) ?? null,
      pickaxe: equipmentRecords.find((item) => item.id === user.equippedPickaxeId) ?? null,
      rod: equipmentRecords.find((item) => item.id === user.equippedRodId) ?? null,
    };

    return NextResponse.json({
      user,
      inventory: topItems.map((entry: InventoryEntry) => ({
        id: entry.id,
        itemId: entry.itemId,
        name: entry.item.name,
        quantity: entry.quantity,
        rarity: entry.item.rarity,
      })),
      equipment,
      activePet: activePet
        ? {
            id: activePet.id,
            name: activePet.pet.name,
            level: activePet.level,
            rarity: activePet.pet.rarity,
          }
        : null,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
