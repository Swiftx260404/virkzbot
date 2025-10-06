import { PrismaClient } from '@prisma/client';

type Output = { itemKey: string; min: number; max: number; chance?: number };

type Config = {
  key: string;
  outputs: Output[];
};

const configs: Config[] = [
  { key: 'pick_stone', outputs: [ { itemKey: 'ore_copper', min: 1, max: 2 }, { itemKey: 'ore_tin', min: 1, max: 1 } ] },
  { key: 'pick_copper', outputs: [ { itemKey: 'bar_bronze', min: 1, max: 2 } ] },
  { key: 'pick_iron', outputs: [ { itemKey: 'bar_iron', min: 1, max: 2 }, { itemKey: 'ore_coal', min: 1, max: 1 } ] },
  { key: 'pick_steel', outputs: [ { itemKey: 'bar_steel', min: 1, max: 2 }, { itemKey: 'dust_arcane', min: 0, max: 1, chance: 0.35 } ] },
  { key: 'pick_diamond', outputs: [ { itemKey: 'gem_sapphire', min: 0, max: 1, chance: 0.6 }, { itemKey: 'ore_obsidian', min: 1, max: 1 } ] },
  { key: 'pick_mythic', outputs: [ { itemKey: 'gem_ruby', min: 0, max: 1, chance: 0.5 }, { itemKey: 'gem_sapphire', min: 0, max: 1, chance: 0.5 }, { itemKey: 'dust_arcane', min: 1, max: 2 } ] },
  { key: 'pick_astral', outputs: [ { itemKey: 'gem_star', min: 0, max: 1, chance: 0.5 }, { itemKey: 'gem_void', min: 0, max: 1, chance: 0.35 }, { itemKey: 'core_astral', min: 0, max: 1, chance: 0.25 } ] },
  { key: 'sword_stone', outputs: [ { itemKey: 'bar_bronze', min: 1, max: 2 } ] },
  { key: 'sword_iron', outputs: [ { itemKey: 'bar_iron', min: 1, max: 2 }, { itemKey: 'dust_arcane', min: 0, max: 1, chance: 0.25 } ] },
  { key: 'sword_steel', outputs: [ { itemKey: 'bar_steel', min: 1, max: 2 }, { itemKey: 'gem_ruby', min: 0, max: 1, chance: 0.35 } ] },
  { key: 'blade_dusk', outputs: [ { itemKey: 'essence_fire', min: 0, max: 1, chance: 0.35 }, { itemKey: 'dust_gilded', min: 1, max: 1 } ] },
  { key: 'armor_chain', outputs: [ { itemKey: 'bar_bronze', min: 1, max: 2 }, { itemKey: 'leather', min: 1, max: 2 } ] },
  { key: 'armor_plate', outputs: [ { itemKey: 'bar_steel', min: 1, max: 2 }, { itemKey: 'scale_serpent', min: 1, max: 1 } ] },
  { key: 'armor_sentinel', outputs: [ { itemKey: 'essence_fire', min: 1, max: 2 }, { itemKey: 'dust_gilded', min: 1, max: 1 } ] },
  { key: 'rod_oak', outputs: [ { itemKey: 'leather', min: 1, max: 2 }, { itemKey: 'fiber_silk', min: 0, max: 1, chance: 0.4 } ] },
  { key: 'rod_flex', outputs: [ { itemKey: 'fiber_silk', min: 1, max: 2 }, { itemKey: 'herb_moon', min: 1, max: 1 } ] },
  { key: 'rod_pro', outputs: [ { itemKey: 'fiber_moonweave', min: 1, max: 2 }, { itemKey: 'fish_tidal_coral', min: 0, max: 1, chance: 0.4 } ] },
  { key: 'rod_legend', outputs: [ { itemKey: 'fish_starlit_koi', min: 1, max: 1 }, { itemKey: 'gem_sapphire', min: 0, max: 1, chance: 0.3 } ] },
];

export async function seedDisassemble(prisma: PrismaClient) {
  for (const cfg of configs) {
    const current = await prisma.item.findUnique({ where: { key: cfg.key }, select: { metadata: true } });
    if (!current) continue;
    const base = (current.metadata && typeof current.metadata === 'object' && !Array.isArray(current.metadata))
      ? { ...(current.metadata as Record<string, unknown>) }
      : {};
    base.disassemble = { outputs: cfg.outputs };
    await prisma.item.update({ where: { key: cfg.key }, data: { metadata: base } });
  }
}
