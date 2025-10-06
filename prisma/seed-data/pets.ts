import { PrismaClient, Rarity } from '@prisma/client';
import petsJson from '../../src/data/pets.json' assert { type: 'json' };

interface RawPet {
  key: string;
  name: string;
  rarity: string;
  formStage?: number;
  basePower?: number;
  passiveBonus?: Record<string, unknown>;
  activeSkill?: Record<string, unknown>;
  evolvesTo?: string;
  requirements?: Record<string, unknown>;
}

const petsData = petsJson as RawPet[];

const asEnum = <T extends Record<string, string>>(en: T, value: string | undefined, field: string) => {
  const key = value ?? Object.keys(en)[0];
  if (key && key in en) return en[key as keyof T];
  throw new Error(`Valor inválido "${value}" para ${field}`);
};

export async function seedPets(prisma: PrismaClient) {
  const keyToId = new Map<string, number>();
  const pendingRelations: { key: string; evolvesTo?: string }[] = [];

  for (const raw of petsData) {
    const data = {
      key: raw.key,
      name: raw.name,
      rarity: asEnum(Rarity, raw.rarity, `Rarity(${raw.key})`),
      formStage: raw.formStage ?? 1,
      basePower: raw.basePower ?? 0,
      passiveBonus: raw.passiveBonus ?? null,
      activeSkill: raw.activeSkill ?? null,
      requirements: raw.requirements ?? null,
    };

    const pet = await prisma.pet.upsert({
      where: { key: raw.key },
      update: data,
      create: data,
    });

    keyToId.set(raw.key, pet.id);
    pendingRelations.push({ key: raw.key, evolvesTo: raw.evolvesTo });
  }

  for (const entry of pendingRelations) {
    if (!entry.evolvesTo) continue;
    const evolvesToId = keyToId.get(entry.evolvesTo);
    if (!evolvesToId) {
      throw new Error(`No se encontró evolución ${entry.evolvesTo} para ${entry.key}`);
    }
    await prisma.pet.update({
      where: { key: entry.key },
      data: { evolvesToId },
    });
  }

  return keyToId;
}
