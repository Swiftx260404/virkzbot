import { PrismaClient } from '@prisma/client';
import { getItemId } from './utils.js';

type Ingredient = { key: string; qty: number };

type Recipe = {
  result: string;
  station: string;
  ingredients: Ingredient[];
  metadata?: Record<string, unknown>;
};

const recipes: Recipe[] = [
  {
    result: 'pick_ancient',
    station: 'forja',
    ingredients: [
      { key: 'pick_astral', qty: 1 },
      { key: 'bar_orichalcum', qty: 6 },
      { key: 'gem_star', qty: 1 },
      { key: 'gem_void', qty: 1 },
      { key: 'core_astral', qty: 1 },
      { key: 'heart_ancient', qty: 1 },
    ],
    metadata: { timeSec: 60, costVcoins: 1400 },
  },
  {
    result: 'rod_mythic',
    station: 'mesa',
    ingredients: [
      { key: 'rod_legend', qty: 1 },
      { key: 'fiber_shadowlace', qty: 3 },
      { key: 'gem_void', qty: 1 },
    ],
    metadata: { timeSec: 45, costVcoins: 900 },
  },
  { result: 'bar_bronze', station: 'forja', ingredients: [ { key: 'ore_copper', qty: 2 }, { key: 'ore_tin', qty: 1 } ], metadata: { costVcoins: 8, timeSec: 4 } },
  { result: 'bar_iron', station: 'forja', ingredients: [ { key: 'ore_iron', qty: 2 }, { key: 'ore_coal', qty: 1 } ], metadata: { costVcoins: 12, timeSec: 5 } },
  { result: 'bar_steel', station: 'forja', ingredients: [ { key: 'bar_iron', qty: 2 }, { key: 'ore_pyrite', qty: 1 }, { key: 'ore_coal', qty: 1 } ], metadata: { costVcoins: 18, timeSec: 6 } },
  { result: 'bar_mythril', station: 'forja', ingredients: [ { key: 'ore_mythril', qty: 2 }, { key: 'dust_arcane', qty: 1 } ], metadata: { costVcoins: 28, timeSec: 8 } },
  { result: 'bar_adamant', station: 'forja', ingredients: [ { key: 'ore_adamant', qty: 2 }, { key: 'ore_cobalt', qty: 1 } ], metadata: { costVcoins: 34, timeSec: 10 } },
  { result: 'bar_orichalcum', station: 'forja', ingredients: [ { key: 'ore_orichalcum', qty: 2 }, { key: 'essence_fire', qty: 1 }, { key: 'essence_frost', qty: 1 } ], metadata: { costVcoins: 42, timeSec: 12 } },
  { result: 'bar_aether', station: 'forja', ingredients: [ { key: 'ore_aether', qty: 2 }, { key: 'gem_star', qty: 1 } ], metadata: { costVcoins: 60, timeSec: 15 } },

  { result: 'potion_small', station: 'alquimia', ingredients: [ { key: 'herb_sun', qty: 2 }, { key: 'fish_riverling', qty: 1 } ], metadata: { costVcoins: 10, timeSec: 2 } },
  { result: 'potion_medium', station: 'alquimia', ingredients: [ { key: 'potion_small', qty: 1 }, { key: 'herb_moon', qty: 2 } ], metadata: { costVcoins: 18, timeSec: 3 } },
  { result: 'potion_large', station: 'alquimia', ingredients: [ { key: 'potion_medium', qty: 1 }, { key: 'herb_storm', qty: 1 }, { key: 'dust_arcane', qty: 1 } ], metadata: { costVcoins: 32, timeSec: 4 } },
  { result: 'potion_major', station: 'alquimia', ingredients: [ { key: 'potion_large', qty: 1 }, { key: 'herb_aurora', qty: 1 }, { key: 'essence_frost', qty: 1 } ], metadata: { costVcoins: 48, timeSec: 5 } },
  { result: 'elixir_luck', station: 'alquimia', ingredients: [ { key: 'gem_sapphire', qty: 1 }, { key: 'herb_aurora', qty: 2 }, { key: 'dust_void', qty: 1 } ], metadata: { costVcoins: 140, timeSec: 6 } },
  { result: 'elixir_focus', station: 'alquimia', ingredients: [ { key: 'herb_moon', qty: 2 }, { key: 'dust_arcane', qty: 1 } ], metadata: { costVcoins: 70, timeSec: 4 } },
  { result: 'tonic_miner', station: 'alquimia', ingredients: [ { key: 'ore_coal', qty: 2 }, { key: 'herb_sun', qty: 1 }, { key: 'dust_arcane', qty: 1 } ], metadata: { costVcoins: 55, timeSec: 4 } },
  { result: 'tonic_fisher', station: 'alquimia', ingredients: [ { key: 'fish_moontrout', qty: 2 }, { key: 'herb_moon', qty: 1 }, { key: 'fish_tidal_coral', qty: 1 } ], metadata: { costVcoins: 55, timeSec: 4 } },

  { result: 'bait_river', station: 'alquimia', ingredients: [ { key: 'bait_basic', qty: 1 }, { key: 'fish_sunperch', qty: 2 }, { key: 'herb_sun', qty: 1 } ], metadata: { costVcoins: 20, timeSec: 3 } },
  { result: 'bait_deep', station: 'alquimia', ingredients: [ { key: 'bait_river', qty: 1 }, { key: 'fish_glacier_cod', qty: 2 }, { key: 'herb_frost', qty: 1 } ], metadata: { costVcoins: 35, timeSec: 3 } },
  { result: 'bait_storm', station: 'alquimia', ingredients: [ { key: 'bait_deep', qty: 1 }, { key: 'fish_stormray', qty: 1 }, { key: 'essence_fire', qty: 1 } ], metadata: { costVcoins: 55, timeSec: 4 } },
  { result: 'bait_luminous', station: 'alquimia', ingredients: [ { key: 'bait_storm', qty: 1 }, { key: 'gem_sapphire', qty: 1 }, { key: 'fish_starlit_koi', qty: 1 } ], metadata: { costVcoins: 80, timeSec: 5 } },
  { result: 'bait_abyss', station: 'alquimia', ingredients: [ { key: 'bait_luminous', qty: 1 }, { key: 'fish_abyssal_eel', qty: 2 }, { key: 'essence_frost', qty: 1 } ], metadata: { costVcoins: 110, timeSec: 5 } },

  { result: 'food_feast', station: 'cocina', ingredients: [ { key: 'fish_starlit_koi', qty: 2 }, { key: 'cook_grain_sky', qty: 2 }, { key: 'cook_spice_ember', qty: 1 } ], metadata: { costVcoins: 90, timeSec: 6 } },
  { result: 'food_sushi', station: 'cocina', ingredients: [ { key: 'fish_emberfin', qty: 1 }, { key: 'fish_starlit_koi', qty: 1 }, { key: 'cook_oil_stellar', qty: 1 } ], metadata: { costVcoins: 110, timeSec: 5 } },
  { result: 'food_broth', station: 'cocina', ingredients: [ { key: 'fish_abyssal_eel', qty: 1 }, { key: 'fish_leviathan_scale', qty: 1 }, { key: 'cook_spice_frost', qty: 1 } ], metadata: { costVcoins: 150, timeSec: 8 } },
  { result: 'food_dessert', station: 'cocina', ingredients: [ { key: 'cook_sugar_moon', qty: 1 }, { key: 'cook_mushroom_echo', qty: 1 }, { key: 'herb_moon', qty: 1 } ], metadata: { costVcoins: 45, timeSec: 4 } },

  { result: 'scroll_mining', station: 'escritura', ingredients: [ { key: 'dust_arcane', qty: 1 }, { key: 'ore_mythril', qty: 1 }, { key: 'fiber_silk', qty: 1 } ], metadata: { costVcoins: 60, timeSec: 4 } },
  { result: 'scroll_fishing', station: 'escritura', ingredients: [ { key: 'dust_arcane', qty: 1 }, { key: 'fish_stormray', qty: 1 }, { key: 'fiber_moonweave', qty: 1 } ], metadata: { costVcoins: 60, timeSec: 4 } },
  { result: 'scroll_boss', station: 'escritura', ingredients: [ { key: 'dust_void', qty: 1 }, { key: 'essence_fire', qty: 1 }, { key: 'essence_frost', qty: 1 } ], metadata: { costVcoins: 120, timeSec: 6 } },
  { result: 'scroll_luck', station: 'escritura', ingredients: [ { key: 'gem_sapphire', qty: 1 }, { key: 'herb_aurora', qty: 1 }, { key: 'dust_gilded', qty: 1 } ], metadata: { costVcoins: 95, timeSec: 5 } },
];

export async function seedCrafting(prisma: PrismaClient) {
  for (const recipe of recipes) {
    const resultItemId = await getItemId(prisma, recipe.result);
    const rec = await prisma.craftRecipe.upsert({
      where: { resultItemId },
      update: { station: recipe.station, metadata: recipe.metadata ?? null },
      create: { resultItemId, station: recipe.station, metadata: recipe.metadata ?? null },
    });

    await prisma.craftIngredient.deleteMany({ where: { recipeId: rec.id } });
    if (recipe.ingredients.length) {
      const data = await Promise.all(
        recipe.ingredients.map(async (ing) => ({
          recipeId: rec.id,
          itemId: await getItemId(prisma, ing.key),
          quantity: ing.qty,
        })),
      );
      await prisma.craftIngredient.createMany({ data });
    }
  }
}
