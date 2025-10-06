import { PrismaClient } from '@prisma/client';
import { getItemId } from './utils.js';

type Mat = { key: string; qty: number };

type Upgrade = {
  base: string;
  result: string;
  cost: number;
  mats: Mat[];
};

const upgrades: Upgrade[] = [
  { base: 'sword_wood', result: 'sword_stone', cost: 50, mats: [{ key: 'bar_bronze', qty: 2 }] },
  { base: 'sword_stone', result: 'sword_iron', cost: 120, mats: [{ key: 'bar_iron', qty: 3 }] },
  { base: 'sword_iron', result: 'sword_steel', cost: 250, mats: [{ key: 'bar_steel', qty: 4 }] },
  { base: 'sword_steel', result: 'blade_dusk', cost: 420, mats: [{ key: 'gem_ruby', qty: 1 }, { key: 'dust_gilded', qty: 1 }] },

  { base: 'pick_wood', result: 'pick_stone', cost: 40, mats: [{ key: 'bar_bronze', qty: 1 }] },
  { base: 'pick_stone', result: 'pick_copper', cost: 70, mats: [{ key: 'bar_bronze', qty: 2 }] },
  { base: 'pick_copper', result: 'pick_iron', cost: 120, mats: [{ key: 'bar_iron', qty: 2 }] },
  { base: 'pick_iron', result: 'pick_steel', cost: 180, mats: [{ key: 'bar_steel', qty: 2 }] },
  { base: 'pick_steel', result: 'pick_diamond', cost: 320, mats: [{ key: 'gem_sapphire', qty: 1 }, { key: 'dust_gilded', qty: 1 }] },
  { base: 'pick_diamond', result: 'pick_mythic', cost: 520, mats: [{ key: 'gem_ruby', qty: 1 }, { key: 'gem_sapphire', qty: 1 }] },
  { base: 'pick_mythic', result: 'pick_astral', cost: 880, mats: [{ key: 'gem_void', qty: 1 }, { key: 'core_astral', qty: 1 }] },

  { base: 'rod_basic', result: 'rod_oak', cost: 60, mats: [{ key: 'leather', qty: 2 }] },
  { base: 'rod_oak', result: 'rod_flex', cost: 90, mats: [{ key: 'fiber_silk', qty: 2 }] },
  { base: 'rod_flex', result: 'rod_pro', cost: 150, mats: [{ key: 'fiber_moonweave', qty: 2 }] },
  { base: 'rod_pro', result: 'rod_elite', cost: 260, mats: [{ key: 'gem_sapphire', qty: 1 }, { key: 'fish_starlit_koi', qty: 2 }] },
  { base: 'rod_elite', result: 'rod_legend', cost: 360, mats: [{ key: 'pet_serpent', qty: 1 }, { key: 'dust_arcane', qty: 1 }] },
  { base: 'rod_legend', result: 'rod_mythic', cost: 520, mats: [{ key: 'gem_void', qty: 1 }, { key: 'bait_abyss', qty: 1 }] },
];

export async function seedUpgrades(prisma: PrismaClient) {
  for (const upgrade of upgrades) {
    const baseItemId = await getItemId(prisma, upgrade.base);
    const resultItemId = await getItemId(prisma, upgrade.result);

    const up = await prisma.itemUpgrade.upsert({
      where: { baseItemId_resultItemId: { baseItemId, resultItemId } },
      update: { costVcoins: upgrade.cost },
      create: { baseItemId, resultItemId, costVcoins: upgrade.cost },
    });

    await prisma.itemUpgradeCost.deleteMany({ where: { upgradeId: up.id } });
    if (upgrade.mats.length) {
      await prisma.itemUpgradeCost.createMany({
        data: await Promise.all(
          upgrade.mats.map(async (mat) => ({
            upgradeId: up.id,
            itemId: await getItemId(prisma, mat.key),
            quantity: mat.qty,
          })),
        ),
      });
    }
  }
}
