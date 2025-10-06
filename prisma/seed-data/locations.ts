import { PrismaClient, LocationKind, ToolKind } from '@prisma/client';
import locationsJson from '../../src/data/locations.json' assert { type: 'json' };
import { slugify } from './utils.js';

type RawLocation = {
  name: string;
  kind: string;
  requiredKind: string;
  requiredTier: number;
  dangerLevel?: number;
  metadata?: Record<string, unknown>;
};

const data = locationsJson as RawLocation[];

const asEnum = <T extends Record<string, string>>(en: T, value: string, field: string) => {
  if (value in en) return en[value as keyof T];
  throw new Error(`Valor inválido "${value}" para ${field}`);
};

export async function seedLocations(prisma: PrismaClient) {
  const slugToId = new Map<string, number>();

  for (const loc of data) {
    const payload = {
      slug: slugify(loc.name),
      name: loc.name,
      kind: asEnum(LocationKind, loc.kind, `LocationKind(${loc.name})`),
      requiredKind: asEnum(ToolKind, loc.requiredKind, `ToolKind(${loc.name})`),
      requiredTier: loc.requiredTier,
      dangerLevel: loc.dangerLevel ?? 0,
      metadata: loc.metadata ?? null,
    };

    const stored = await prisma.location.upsert({
      where: { slug: payload.slug },
      update: payload,
      create: payload,
    });
    slugToId.set(payload.slug, stored.id);
  }

  return slugToId;
}
