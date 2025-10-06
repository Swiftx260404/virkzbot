import { PrismaClient, ItemType, ToolKind, Rarity } from '@prisma/client';
import itemsJson from '../../src/data/items.json' assert { type: 'json' };

type RawItem = {
  key: string;
  name: string;
  type: string;
  rarity?: string;
  price?: number;
  buyable?: boolean;
  sellable?: boolean;
  usable?: boolean;
  toolKind?: string;
  tier?: number;
  power?: number;
  durability?: number;
  metadata?: Record<string, unknown>;
};

const itemsData = itemsJson as RawItem[];

const asEnum = <T extends Record<string, string>>(en: T, value: string | undefined, field: string) => {
  const key = value ?? Object.keys(en)[0];
  if (key && key in en) return en[key as keyof T];
  throw new Error(`Valor inválido "${value}" para ${field}`);
};

export async function seedItems(prisma: PrismaClient) {
  const keyToId = new Map<string, number>();

  for (const raw of itemsData) {
    const data = {
      key: raw.key,
      name: raw.name,
      type: asEnum(ItemType, raw.type, `ItemType(${raw.key})`),
      rarity: asEnum(Rarity, raw.rarity ?? 'COMMON', `Rarity(${raw.key})`),
      price: raw.price ?? 0,
      buyable: raw.buyable ?? true,
      sellable: raw.sellable ?? true,
      usable: raw.usable ?? false,
      toolKind: asEnum(ToolKind, raw.toolKind ?? 'NONE', `ToolKind(${raw.key})`),
      tier: raw.tier ?? null,
      power: raw.power ?? null,
      durability: raw.durability ?? null,
      metadata: raw.metadata ?? null,
    };

    const item = await prisma.item.upsert({
      where: { key: raw.key },
      update: data,
      create: data,
    });
    keyToId.set(item.key, item.id);
  }

  return keyToId;
}
