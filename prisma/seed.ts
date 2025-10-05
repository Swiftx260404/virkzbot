import {
  PrismaClient,
  ToolKind,
  ItemType,
  LocationKind,
  EffectType,
  EffectTarget,
  Rarity,
} from '@prisma/client';

const prisma = new PrismaClient();

const slugify = (s: string) =>
  s.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

async function main() {
  // ======================================================
  // ITEMS (muchos más + rarezas + flags + durabilidades bajas)
  // ======================================================
  const items = [
    // PICKAXES (durabilidad máxima 15; casi parejas)
    { key: 'pick_wood',    name: 'Pico de Madera',   type: ItemType.TOOL, rarity: Rarity.COMMON,    price: 50,  buyable: true,  sellable: true, usable: false, toolKind: ToolKind.PICKAXE, tier: 1, power: 1,  durability: 5  },
    { key: 'pick_stone',   name: 'Pico de Piedra',   type: ItemType.TOOL, rarity: Rarity.COMMON,    price: 120, buyable: true,  sellable: true, usable: false, toolKind: ToolKind.PICKAXE, tier: 2, power: 2,  durability: 6  },
    { key: 'pick_copper',  name: 'Pico de Cobre',    type: ItemType.TOOL, rarity: Rarity.UNCOMMON,  price: 220, buyable: true,  sellable: true, usable: false, toolKind: ToolKind.PICKAXE, tier: 2, power: 2,  durability: 7  },
    { key: 'pick_iron',    name: 'Pico de Hierro',   type: ItemType.TOOL, rarity: Rarity.UNCOMMON,  price: 380, buyable: true,  sellable: true, usable: false, toolKind: ToolKind.PICKAXE, tier: 3, power: 3,  durability: 8  },
    { key: 'pick_steel',   name: 'Pico de Acero',    type: ItemType.TOOL, rarity: Rarity.RARE,      price: 700, buyable: true,  sellable: true, usable: false, toolKind: ToolKind.PICKAXE, tier: 4, power: 4,  durability: 9  },
    { key: 'pick_diamond', name: 'Pico de Diamante', type: ItemType.TOOL, rarity: Rarity.EPIC,      price: 1300,buyable: true,  sellable: true, usable: false, toolKind: ToolKind.PICKAXE, tier: 5, power: 5,  durability: 11 },
    { key: 'pick_mythic',  name: 'Pico Mítico',      type: ItemType.TOOL, rarity: Rarity.LEGENDARY, price: 2200,buyable: true,  sellable: true, usable: false, toolKind: ToolKind.PICKAXE, tier: 5, power: 6,  durability: 13, metadata: { aura: 0.05 } },
    // SOLO CRAFTEO (no se compra)
    { key: 'pick_ancient', name: 'Pico Ancestral',   type: ItemType.TOOL, rarity: Rarity.MYTHIC,    price: 0,   buyable: false, sellable: false, usable: false, toolKind: ToolKind.PICKAXE, tier: 6, power: 7,  durability: 15, metadata: { soulbound: true } },

    // RODS (máx 15 también)
    { key: 'rod_basic',   name: 'Caña Básica',   type: ItemType.TOOL, rarity: Rarity.COMMON,   price: 80,   buyable: true,  sellable: true, usable: false, toolKind: ToolKind.ROD, tier: 1, power: 1, durability: 5  },
    { key: 'rod_oak',     name: 'Caña de Roble', type: ItemType.TOOL, rarity: Rarity.UNCOMMON, price: 180,  buyable: true,  sellable: true, usable: false, toolKind: ToolKind.ROD, tier: 2, power: 2, durability: 6  },
    { key: 'rod_flex',    name: 'Caña Flexible', type: ItemType.TOOL, rarity: Rarity.UNCOMMON, price: 300,  buyable: true,  sellable: true, usable: false, toolKind: ToolKind.ROD, tier: 3, power: 3, durability: 7  },
    { key: 'rod_pro',     name: 'Caña Pro',      type: ItemType.TOOL, rarity: Rarity.RARE,     price: 600,  buyable: true,  sellable: true, usable: false, toolKind: ToolKind.ROD, tier: 3, power: 3, durability: 9  },
    { key: 'rod_elite',   name: 'Caña Élite',    type: ItemType.TOOL, rarity: Rarity.EPIC,     price: 1200, buyable: true,  sellable: true, usable: false, toolKind: ToolKind.ROD, tier: 4, power: 4, durability: 11 },
    { key: 'rod_legend',  name: 'Caña Legendaria',type: ItemType.TOOL,rarity: Rarity.LEGENDARY,price: 2000, buyable: true,  sellable: true, usable: false, toolKind: ToolKind.ROD, tier: 5, power: 5, durability: 13 },
    { key: 'rod_mythic',  name: 'Caña Mítica',   type: ItemType.TOOL, rarity: Rarity.MYTHIC,   price: 0,   buyable: false, sellable: false, usable: false, toolKind: ToolKind.ROD, tier: 6, power: 6, durability: 15, metadata: { soulbound: true } },

    // WEAPONS
    { key: 'sword_wood',   name: 'Espada de Madera', type: ItemType.WEAPON, rarity: Rarity.COMMON,   price: 60,  buyable: true,  sellable: true, usable: false, toolKind: ToolKind.WEAPON, tier: 1, power: 5,  metadata: { crit: 0.02 } },
    { key: 'sword_stone',  name: 'Espada de Piedra', type: ItemType.WEAPON, rarity: Rarity.UNCOMMON, price: 200, buyable: true,  sellable: true, usable: false, toolKind: ToolKind.WEAPON, tier: 2, power: 10, metadata: { crit: 0.03 } },
    { key: 'sword_iron',   name: 'Espada de Hierro', type: ItemType.WEAPON, rarity: Rarity.RARE,     price: 600, buyable: true,  sellable: true, usable: false, toolKind: ToolKind.WEAPON, tier: 3, power: 18, metadata: { crit: 0.04 } },
    { key: 'sword_steel',  name: 'Espada de Acero',  type: ItemType.WEAPON, rarity: Rarity.EPIC,     price: 1500,buyable: true,  sellable: true, usable: false, toolKind: ToolKind.WEAPON, tier: 4, power: 28, metadata: { crit: 0.05 } },
    { key: 'sword_mythic', name: 'Espada Mítica',    type: ItemType.WEAPON, rarity: Rarity.LEGENDARY,price: 0,   buyable: false, sellable: false, usable: false, toolKind: ToolKind.WEAPON, tier: 5, power: 45, metadata: { crit: 0.08, soulbound: true } },

    // ARMOR
    { key: 'armor_leather', name: 'Armadura de Cuero',  type: ItemType.ARMOR, rarity: Rarity.COMMON,   price: 120, buyable: true, sellable: true, usable: false, toolKind: ToolKind.ARMOR, tier: 1, power: 3 },
    { key: 'armor_chain',   name: 'Cota de Malla',      type: ItemType.ARMOR, rarity: Rarity.UNCOMMON, price: 500, buyable: true, sellable: true, usable: false, toolKind: ToolKind.ARMOR, tier: 2, power: 7 },
    { key: 'armor_plate',   name: 'Armadura de Placas', type: ItemType.ARMOR, rarity: Rarity.RARE,     price: 1200,buyable: true, sellable: true, usable: false, toolKind: ToolKind.ARMOR, tier: 3, power: 12 },
    { key: 'armor_mythic',  name: 'Armadura Mítica',    type: ItemType.ARMOR, rarity: Rarity.LEGENDARY,price: 0,   buyable: false,sellable: false, usable: false, toolKind: ToolKind.ARMOR, tier: 5, power: 22, metadata: { shield: 10, soulbound: true } },

    // MATERIALS (minerales, barras, gemas, plantas, cueros, peces)
    { key: 'ore_copper', name: 'Mena de Cobre',  type: ItemType.MATERIAL, rarity: Rarity.COMMON,   price: 5,  buyable: false, sellable: true, usable: false, toolKind: ToolKind.NONE },
    { key: 'ore_tin',    name: 'Mena de Estaño', type: ItemType.MATERIAL, rarity: Rarity.COMMON,   price: 6,  buyable: false, sellable: true, usable: false, toolKind: ToolKind.NONE },
    { key: 'ore_iron',   name: 'Mena de Hierro', type: ItemType.MATERIAL, rarity: Rarity.UNCOMMON, price: 10, buyable: false, sellable: true, usable: false, toolKind: ToolKind.NONE },
    { key: 'ore_silver', name: 'Mena de Plata',  type: ItemType.MATERIAL, rarity: Rarity.RARE,     price: 18, buyable: false, sellable: true, usable: false, toolKind: ToolKind.NONE },
    { key: 'ore_gold',   name: 'Mena de Oro',    type: ItemType.MATERIAL, rarity: Rarity.RARE,     price: 25, buyable: false, sellable: true, usable: false, toolKind: ToolKind.NONE },

    { key: 'bar_bronze', name: 'Lingote de Bronce', type: ItemType.MATERIAL, rarity: Rarity.UNCOMMON, price: 16, buyable: false, sellable: true, usable: false, toolKind: ToolKind.NONE },
    { key: 'bar_iron',   name: 'Lingote de Hierro',  type: ItemType.MATERIAL, rarity: Rarity.UNCOMMON, price: 45, buyable: false, sellable: true, usable: false, toolKind: ToolKind.NONE },
    { key: 'bar_steel',  name: 'Lingote de Acero',   type: ItemType.MATERIAL, rarity: Rarity.RARE,     price: 90, buyable: false, sellable: true, usable: false, toolKind: ToolKind.NONE },

    { key: 'gem_ruby',    name: 'Rubí',      type: ItemType.MATERIAL, rarity: Rarity.EPIC,     price: 120, buyable: false, sellable: true, usable: false, toolKind: ToolKind.NONE },
    { key: 'gem_sapphire',name: 'Zafiro',    type: ItemType.MATERIAL, rarity: Rarity.EPIC,     price: 120, buyable: false, sellable: true, usable: false, toolKind: ToolKind.NONE },
    { key: 'gem_emerald', name: 'Esmeralda', type: ItemType.MATERIAL, rarity: Rarity.LEGENDARY,price: 240, buyable: false, sellable: true, usable: false, toolKind: ToolKind.NONE },

    { key: 'leather',     name: 'Cuero',      type: ItemType.MATERIAL, rarity: Rarity.COMMON,   price: 8,  buyable: false, sellable: true, usable: false, toolKind: ToolKind.NONE },
    { key: 'slime',       name: 'Baba',       type: ItemType.MATERIAL, rarity: Rarity.COMMON,   price: 4,  buyable: false, sellable: true, usable: false, toolKind: ToolKind.NONE },
    { key: 'core_mythic', name: 'Núcleo Mítico', type: ItemType.MATERIAL, rarity: Rarity.MYTHIC, price: 0,  buyable: false, sellable: false, usable: false, toolKind: ToolKind.NONE },

    { key: 'fish_common', name: 'Pez Común',  type: ItemType.MATERIAL, rarity: Rarity.COMMON,   price: 6,  buyable: false, sellable: true, usable: false, toolKind: ToolKind.NONE },
    { key: 'fish_rare',   name: 'Pez Raro',   type: ItemType.MATERIAL, rarity: Rarity.RARE,     price: 20, buyable: false, sellable: true, usable: false, toolKind: ToolKind.NONE },
    { key: 'ore_coal',    name: 'Carbón',          type: ItemType.MATERIAL, rarity: Rarity.COMMON,   price: 8,  buyable: false, sellable: true, usable: false, toolKind: ToolKind.NONE },
    { key: 'ore_obsidian',name: 'Obsidiana',       type: ItemType.MATERIAL, rarity: Rarity.EPIC,     price: 40, buyable: false, sellable: true, usable: false, toolKind: ToolKind.NONE },
    { key: 'herb_sun',    name: 'Hierba Solar',    type: ItemType.MATERIAL, rarity: Rarity.COMMON,   price: 6,  buyable: false, sellable: true, usable: false, toolKind: ToolKind.NONE },
    { key: 'herb_moon',   name: 'Hierba Lunar',    type: ItemType.MATERIAL, rarity: Rarity.UNCOMMON, price: 12, buyable: false, sellable: true, usable: false, toolKind: ToolKind.NONE },
    { key: 'dust_arcane', name: 'Polvo Arcano',    type: ItemType.MATERIAL, rarity: Rarity.RARE,     price: 60, buyable: false, sellable: true, usable: false, toolKind: ToolKind.NONE },
    { key: 'fiber_silk',  name: 'Fibra de Seda',   type: ItemType.MATERIAL, rarity: Rarity.UNCOMMON, price: 18, buyable: false, sellable: true, usable: false, toolKind: ToolKind.NONE },
    { key: 'pearl_black', name: 'Perla Negra',     type: ItemType.MATERIAL, rarity: Rarity.RARE,     price: 65, buyable: false, sellable: true, usable: false, toolKind: ToolKind.NONE },
    { key: 'scale_serpent', name: 'Escama de Serpiente', type: ItemType.MATERIAL, rarity: Rarity.RARE, price: 55, buyable: false, sellable: true, usable: false, toolKind: ToolKind.NONE },

    // CONSUMABLES (usables)
    { key: 'potion_small',   name: 'Poción Pequeña', type: ItemType.CONSUMABLE, rarity: Rarity.COMMON,   price: 30,  buyable: true,  sellable: true, usable: true, toolKind: ToolKind.NONE, metadata: { cdSec: 10 } },
    { key: 'potion_large',   name: 'Poción Grande',  type: ItemType.CONSUMABLE, rarity: Rarity.RARE,     price: 120, buyable: true,  sellable: true, usable: true, toolKind: ToolKind.NONE, metadata: { cdSec: 20 } },
    { key: 'food_meat',      name: 'Carne Asada',    type: ItemType.CONSUMABLE, rarity: Rarity.UNCOMMON, price: 25,  buyable: true,  sellable: true, usable: true, toolKind: ToolKind.NONE },
    { key: 'bomb_small',     name: 'Bomba Pequeña',  type: ItemType.CONSUMABLE, rarity: Rarity.UNCOMMON, price: 80,  buyable: true,  sellable: true, usable: true, toolKind: ToolKind.NONE },
    { key: 'tincture_crit',  name: 'Tinción del Asesino', type: ItemType.CONSUMABLE, rarity: Rarity.EPIC, price: 300, buyable: true, sellable: true, usable: true, toolKind: ToolKind.NONE, metadata: { cdSec: 30 } },
    { key: 'bait_basic',     name: 'Cebo Básico',    type: ItemType.CONSUMABLE, rarity: Rarity.COMMON,   price: 12,  buyable: true,  sellable: true, usable: true, toolKind: ToolKind.NONE, metadata: { uses: 5 } },
    { key: 'bait_premium',   name: 'Cebo Premium',   type: ItemType.CONSUMABLE, rarity: Rarity.RARE,     price: 60,  buyable: true,  sellable: true, usable: true, toolKind: ToolKind.NONE, metadata: { uses: 10 } },
    { key: 'tea_focus',      name: 'Té de Enfoque',  type: ItemType.CONSUMABLE, rarity: Rarity.UNCOMMON, price: 45, buyable: false, sellable: true, usable: true, toolKind: ToolKind.NONE },
    { key: 'tonic_miner',    name: 'Tónico del Minero', type: ItemType.CONSUMABLE, rarity: Rarity.RARE, price: 70, buyable: false, sellable: true, usable: true, toolKind: ToolKind.NONE },
    { key: 'elixir_luck',    name: 'Elixir de Suerte', type: ItemType.CONSUMABLE, rarity: Rarity.EPIC, price: 140, buyable: false, sellable: true, usable: true, toolKind: ToolKind.NONE },
    { key: 'bait_luminous',  name: 'Cebo Luminoso',  type: ItemType.CONSUMABLE, rarity: Rarity.EPIC, price: 120, buyable: false, sellable: true, usable: true, toolKind: ToolKind.NONE, metadata: { uses: 15 } },
  ];

  for (const it of items) {
    await prisma.item.upsert({ where: { key: it.key }, update: it, create: it });
  }

  const disassembleConfigs = [
    { key: 'pick_stone', outputs: [ { itemKey: 'ore_copper', min: 1, max: 2 }, { itemKey: 'ore_tin', min: 1, max: 1 } ] },
    { key: 'pick_copper', outputs: [ { itemKey: 'bar_bronze', min: 1, max: 2 } ] },
    { key: 'pick_iron', outputs: [ { itemKey: 'bar_iron', min: 1, max: 2 }, { itemKey: 'ore_coal', min: 1, max: 1 } ] },
    { key: 'pick_steel', outputs: [ { itemKey: 'bar_steel', min: 1, max: 2 }, { itemKey: 'dust_arcane', min: 0, max: 1, chance: 0.35 } ] },
    { key: 'pick_diamond', outputs: [ { itemKey: 'gem_sapphire', min: 0, max: 1, chance: 0.6 }, { itemKey: 'ore_obsidian', min: 1, max: 1 } ] },
    { key: 'pick_mythic', outputs: [ { itemKey: 'gem_ruby', min: 0, max: 1, chance: 0.5 }, { itemKey: 'gem_sapphire', min: 0, max: 1, chance: 0.5 }, { itemKey: 'dust_arcane', min: 1, max: 2 } ] },
    { key: 'sword_stone', outputs: [ { itemKey: 'bar_bronze', min: 1, max: 2 } ] },
    { key: 'sword_iron', outputs: [ { itemKey: 'bar_iron', min: 1, max: 2 }, { itemKey: 'dust_arcane', min: 0, max: 1, chance: 0.25 } ] },
    { key: 'sword_steel', outputs: [ { itemKey: 'bar_steel', min: 1, max: 2 }, { itemKey: 'gem_ruby', min: 0, max: 1, chance: 0.35 } ] },
    { key: 'sword_mythic', outputs: [ { itemKey: 'gem_emerald', min: 0, max: 1, chance: 0.4 }, { itemKey: 'dust_arcane', min: 1, max: 2 }, { itemKey: 'core_mythic', min: 0, max: 1, chance: 0.25 } ] },
    { key: 'armor_chain', outputs: [ { itemKey: 'bar_bronze', min: 1, max: 2 }, { itemKey: 'leather', min: 1, max: 2 } ] },
    { key: 'armor_plate', outputs: [ { itemKey: 'bar_steel', min: 1, max: 2 }, { itemKey: 'scale_serpent', min: 1, max: 1 } ] },
    { key: 'armor_mythic', outputs: [ { itemKey: 'core_mythic', min: 0, max: 1, chance: 0.25 }, { itemKey: 'gem_emerald', min: 0, max: 1, chance: 0.4 }, { itemKey: 'dust_arcane', min: 1, max: 2 } ] },
    { key: 'rod_oak', outputs: [ { itemKey: 'leather', min: 1, max: 2 }, { itemKey: 'fiber_silk', min: 0, max: 1, chance: 0.4 } ] },
    { key: 'rod_flex', outputs: [ { itemKey: 'fiber_silk', min: 1, max: 2 }, { itemKey: 'herb_moon', min: 1, max: 1 } ] },
    { key: 'rod_pro', outputs: [ { itemKey: 'fiber_silk', min: 1, max: 2 }, { itemKey: 'pearl_black', min: 0, max: 1, chance: 0.4 } ] },
    { key: 'rod_legend', outputs: [ { itemKey: 'pearl_black', min: 1, max: 1 }, { itemKey: 'gem_sapphire', min: 0, max: 1, chance: 0.3 } ] },
  ];

  for (const cfg of disassembleConfigs) {
    const current = await prisma.item.findUnique({ where: { key: cfg.key }, select: { metadata: true } });
    const baseMeta = (current?.metadata && typeof current.metadata === 'object' && !Array.isArray(current.metadata)) ? { ...(current.metadata as any) } : {};
    baseMeta.disassemble = { outputs: cfg.outputs };
    await prisma.item.update({ where: { key: cfg.key }, data: { metadata: baseMeta } });
  }

  const itemId = async (key: string) =>
    (await prisma.item.findUniqueOrThrow({ where: { key }, select: { id: true } })).id;

  // ======================================================
  // EFECTOS
  // ======================================================
  const effectsData = [
    { itemKey: 'potion_small', type: EffectType.HEAL,           target: EffectTarget.SELF,  magnitude: 30 },
    { itemKey: 'potion_large', type: EffectType.HEAL,           target: EffectTarget.SELF,  magnitude: 80 },
    { itemKey: 'food_meat',    type: EffectType.BUFF_DEFENSE,   target: EffectTarget.SELF,  magnitude: 5,  durationSec: 600 },
    { itemKey: 'bomb_small',   type: EffectType.DAMAGE,         target: EffectTarget.ENEMY, magnitude: 35 },
    { itemKey: 'tincture_crit',type: EffectType.BUFF_CRIT,      target: EffectTarget.SELF,  magnitude: 0.15, durationSec: 300 },
    { itemKey: 'bait_basic',   type: EffectType.BUFF_DROP_RATE, target: EffectTarget.TOOL,  magnitude: 0.10, durationSec: 1800, metadata: { appliesTo: 'ROD' } },
    { itemKey: 'bait_premium', type: EffectType.BUFF_DROP_RATE, target: EffectTarget.TOOL,  magnitude: 0.25, durationSec: 1800, metadata: { appliesTo: 'ROD' } },
    { itemKey: 'tea_focus',    type: EffectType.BUFF_WORK_PAYOUT, target: EffectTarget.SELF, magnitude: 0.25, durationSec: 600, metadata: { appliesTo: 'WORK' } },
    { itemKey: 'tonic_miner',  type: EffectType.BUFF_RESOURCE_YIELD, target: EffectTarget.TOOL, magnitude: 0.35, durationSec: 900, metadata: { appliesTo: ['PICKAXE', 'MINE'] } },
    { itemKey: 'elixir_luck',  type: EffectType.BUFF_LUCK,      target: EffectTarget.SELF,  magnitude: 0.25, durationSec: 600, metadata: { appliesTo: ['MINE','FISH','WORK'] } },
    { itemKey: 'bait_luminous',type: EffectType.BUFF_DROP_RATE, target: EffectTarget.TOOL,  magnitude: 0.40, durationSec: 1800, metadata: { appliesTo: 'ROD' } },
  ];

  for (const e of effectsData) {
    const id = await itemId(e.itemKey);
    await prisma.itemEffect.deleteMany({ where: { itemId: id } });
    await prisma.itemEffect.create({
      data: {
        itemId: id,
        type: e.type,
        target: e.target,
        magnitude: e.magnitude,
        durationSec: e.durationSec,
        metadata: e.metadata,
      },
    });
  }

  // ======================================================
  // UPGRADES (mejoras por vcoins + materiales)
  // ======================================================
  const upgrades = [
    { base: 'sword_wood',  result: 'sword_stone', cost: 50,  mats: [{ key: 'bar_bronze', qty: 2 }] },
    { base: 'sword_stone', result: 'sword_iron',  cost: 120, mats: [{ key: 'bar_iron',   qty: 3 }] },
    { base: 'sword_iron',  result: 'sword_steel', cost: 250, mats: [{ key: 'bar_steel',  qty: 4 }] },

    { base: 'pick_wood',   result: 'pick_stone',  cost: 40,  mats: [{ key: 'bar_bronze', qty: 1 }] },
    { base: 'pick_stone',  result: 'pick_copper', cost: 70,  mats: [{ key: 'bar_bronze', qty: 2 }] },
    { base: 'pick_copper', result: 'pick_iron',   cost: 120, mats: [{ key: 'bar_iron',   qty: 2 }] },
    { base: 'pick_iron',   result: 'pick_steel',  cost: 180, mats: [{ key: 'bar_steel',  qty: 2 }] },
    { base: 'pick_steel',  result: 'pick_diamond',cost: 300, mats: [{ key: 'gem_sapphire', qty: 1 }] },
    { base: 'pick_diamond',result: 'pick_mythic', cost: 500, mats: [{ key: 'gem_ruby', qty: 1 }, { key: 'gem_sapphire', qty: 1 }] },
  ];

  for (const u of upgrades) {
    const up = await prisma.itemUpgrade.create({
      data: {
        baseItemId: await itemId(u.base),
        resultItemId: await itemId(u.result),
        costVcoins: u.cost,
      },
    });
    for (const m of u.mats) {
      await prisma.itemUpgradeCost.create({
        data: { upgradeId: up.id, itemId: await itemId(m.key), quantity: m.qty },
      });
    }
  }

  // ======================================================
  // CRAFTEO (recetas) — pico y caña solo crafteables
  // ======================================================
  const craftRecipes = [
    {
      result: 'pick_ancient',
      station: 'forja',
      ingredients: [
        { key: 'pick_mythic', qty: 1 },
        { key: 'bar_steel',   qty: 6 },
        { key: 'gem_ruby',    qty: 1 },
        { key: 'gem_sapphire',qty: 1 },
        { key: 'gem_emerald', qty: 1 },
        { key: 'core_mythic', qty: 1 },
      ],
      metadata: { timeSec: 45, costVcoins: 800 },
    },
    {
      result: 'rod_mythic',
      station: 'mesa',
      ingredients: [
        { key: 'rod_legend',  qty: 1 },
        { key: 'fiber_silk',  qty: 4 },
        { key: 'gem_emerald', qty: 1 },
        { key: 'core_mythic', qty: 1 },
      ],
      metadata: { timeSec: 30, costVcoins: 650 },
    },
    {
      result: 'bar_bronze',
      station: 'forja',
      ingredients: [
        { key: 'ore_copper', qty: 2 },
        { key: 'ore_tin',    qty: 1 },
      ],
      metadata: { costVcoins: 8, timeSec: 4 },
    },
    {
      result: 'bar_iron',
      station: 'forja',
      ingredients: [
        { key: 'ore_iron', qty: 2 },
        { key: 'ore_coal', qty: 1 },
      ],
      metadata: { costVcoins: 12, timeSec: 5 },
    },
    {
      result: 'bar_steel',
      station: 'forja',
      ingredients: [
        { key: 'bar_iron', qty: 2 },
        { key: 'ore_silver', qty: 1 },
        { key: 'ore_coal', qty: 1 },
      ],
      metadata: { costVcoins: 18, timeSec: 6 },
    },
    {
      result: 'bait_premium',
      station: 'alquimia',
      ingredients: [
        { key: 'bait_basic', qty: 1 },
        { key: 'fish_rare',  qty: 2 },
        { key: 'herb_sun',   qty: 1 },
      ],
      metadata: { costVcoins: 25, timeSec: 3 },
    },
    {
      result: 'bait_luminous',
      station: 'alquimia',
      ingredients: [
        { key: 'bait_premium', qty: 1 },
        { key: 'pearl_black', qty: 1 },
        { key: 'gem_sapphire', qty: 1 },
      ],
      metadata: { costVcoins: 80, timeSec: 5 },
    },
    {
      result: 'potion_small',
      station: 'alquimia',
      ingredients: [
        { key: 'herb_sun',    qty: 2 },
        { key: 'fish_common', qty: 1 },
      ],
      metadata: { costVcoins: 10, timeSec: 2 },
    },
    {
      result: 'potion_large',
      station: 'alquimia',
      ingredients: [
        { key: 'potion_small', qty: 1 },
        { key: 'herb_moon',    qty: 2 },
        { key: 'dust_arcane',  qty: 1 },
      ],
      metadata: { costVcoins: 35, timeSec: 4 },
    },
    {
      result: 'food_meat',
      station: 'cocina',
      ingredients: [
        { key: 'fish_common', qty: 2 },
        { key: 'herb_sun',    qty: 1 },
        { key: 'leather',     qty: 1 },
      ],
      metadata: { costVcoins: 15, timeSec: 3 },
    },
    {
      result: 'tea_focus',
      station: 'alquimia',
      ingredients: [
        { key: 'herb_sun',   qty: 1 },
        { key: 'herb_moon',  qty: 1 },
        { key: 'dust_arcane', qty: 1 },
      ],
      metadata: { costVcoins: 40, timeSec: 4 },
    },
    {
      result: 'tonic_miner',
      station: 'alquimia',
      ingredients: [
        { key: 'ore_coal',    qty: 2 },
        { key: 'herb_sun',    qty: 1 },
        { key: 'dust_arcane', qty: 1 },
      ],
      metadata: { costVcoins: 45, timeSec: 4 },
    },
    {
      result: 'elixir_luck',
      station: 'alquimia',
      ingredients: [
        { key: 'gem_sapphire', qty: 1 },
        { key: 'herb_moon',    qty: 2 },
        { key: 'dust_arcane',  qty: 2 },
      ],
      metadata: { costVcoins: 120, timeSec: 6 },
    },
    {
      result: 'pick_stone',
      station: 'forja',
      ingredients: [
        { key: 'pick_wood',   qty: 1 },
        { key: 'bar_bronze',  qty: 1 },
        { key: 'ore_coal',    qty: 1 },
      ],
      metadata: { costVcoins: 40, timeSec: 5 },
    },
    {
      result: 'pick_copper',
      station: 'forja',
      ingredients: [
        { key: 'pick_stone', qty: 1 },
        { key: 'bar_bronze', qty: 2 },
        { key: 'ore_tin',    qty: 2 },
      ],
      metadata: { costVcoins: 80, timeSec: 6 },
    },
    {
      result: 'pick_iron',
      station: 'forja',
      ingredients: [
        { key: 'pick_copper', qty: 1 },
        { key: 'bar_iron',    qty: 2 },
        { key: 'ore_iron',    qty: 2 },
      ],
      metadata: { costVcoins: 120, timeSec: 6 },
    },
    {
      result: 'pick_steel',
      station: 'forja',
      ingredients: [
        { key: 'pick_iron',  qty: 1 },
        { key: 'bar_steel',  qty: 2 },
        { key: 'gem_ruby',   qty: 1 },
      ],
      metadata: { costVcoins: 180, timeSec: 8 },
    },
    {
      result: 'pick_diamond',
      station: 'forja',
      ingredients: [
        { key: 'pick_steel',   qty: 1 },
        { key: 'bar_steel',    qty: 2 },
        { key: 'gem_sapphire', qty: 1 },
        { key: 'dust_arcane',  qty: 1 },
      ],
      metadata: { costVcoins: 280, timeSec: 8 },
    },
    {
      result: 'rod_oak',
      station: 'mesa',
      ingredients: [
        { key: 'rod_basic', qty: 1 },
        { key: 'leather',   qty: 3 },
        { key: 'fiber_silk', qty: 1 },
      ],
      metadata: { costVcoins: 90, timeSec: 5 },
    },
    {
      result: 'rod_flex',
      station: 'mesa',
      ingredients: [
        { key: 'rod_oak',    qty: 1 },
        { key: 'fiber_silk', qty: 2 },
        { key: 'herb_moon',  qty: 1 },
      ],
      metadata: { costVcoins: 130, timeSec: 5 },
    },
    {
      result: 'rod_pro',
      station: 'mesa',
      ingredients: [
        { key: 'rod_flex',   qty: 1 },
        { key: 'fiber_silk', qty: 2 },
        { key: 'pearl_black', qty: 1 },
      ],
      metadata: { costVcoins: 200, timeSec: 6 },
    },
    {
      result: 'rod_legend',
      station: 'mesa',
      ingredients: [
        { key: 'rod_pro',     qty: 1 },
        { key: 'gem_sapphire', qty: 1 },
        { key: 'pearl_black',  qty: 1 },
        { key: 'dust_arcane',  qty: 1 },
      ],
      metadata: { costVcoins: 320, timeSec: 8 },
    },
    {
      result: 'armor_chain',
      station: 'forja',
      ingredients: [
        { key: 'armor_leather', qty: 1 },
        { key: 'bar_bronze',    qty: 3 },
        { key: 'scale_serpent', qty: 2 },
      ],
      metadata: { costVcoins: 180, timeSec: 6 },
    },
    {
      result: 'armor_plate',
      station: 'forja',
      ingredients: [
        { key: 'armor_chain',   qty: 1 },
        { key: 'bar_steel',     qty: 3 },
        { key: 'scale_serpent', qty: 2 },
      ],
      metadata: { costVcoins: 320, timeSec: 8 },
    },
    {
      result: 'armor_mythic',
      station: 'forja',
      ingredients: [
        { key: 'armor_plate', qty: 1 },
        { key: 'core_mythic', qty: 1 },
        { key: 'gem_emerald', qty: 1 },
        { key: 'dust_arcane', qty: 2 },
      ],
      metadata: { costVcoins: 600, timeSec: 12 },
    },
    {
      result: 'sword_stone',
      station: 'forja',
      ingredients: [
        { key: 'sword_wood',  qty: 1 },
        { key: 'bar_bronze',  qty: 2 },
        { key: 'ore_coal',    qty: 1 },
      ],
      metadata: { costVcoins: 70, timeSec: 4 },
    },
    {
      result: 'sword_iron',
      station: 'forja',
      ingredients: [
        { key: 'sword_stone', qty: 1 },
        { key: 'bar_iron',    qty: 3 },
        { key: 'dust_arcane', qty: 1 },
      ],
      metadata: { costVcoins: 140, timeSec: 5 },
    },
    {
      result: 'sword_steel',
      station: 'forja',
      ingredients: [
        { key: 'sword_iron', qty: 1 },
        { key: 'bar_steel',  qty: 3 },
        { key: 'gem_ruby',   qty: 1 },
      ],
      metadata: { costVcoins: 260, timeSec: 6 },
    },
    {
      result: 'sword_mythic',
      station: 'forja',
      ingredients: [
        { key: 'sword_steel', qty: 1 },
        { key: 'gem_emerald', qty: 1 },
        { key: 'core_mythic', qty: 1 },
        { key: 'dust_arcane', qty: 2 },
      ],
      metadata: { costVcoins: 520, timeSec: 10 },
    },
    {
      result: 'fiber_silk',
      station: 'mesa',
      ingredients: [
        { key: 'leather',     qty: 2 },
        { key: 'fish_common', qty: 1 },
        { key: 'herb_sun',    qty: 1 },
      ],
      metadata: { costVcoins: 25, batch: 2, timeSec: 3 },
    },
    {
      result: 'dust_arcane',
      station: 'alquimia',
      ingredients: [
        { key: 'slime',       qty: 3 },
        { key: 'herb_moon',   qty: 1 },
        { key: 'ore_obsidian', qty: 1 },
      ],
      metadata: { costVcoins: 30, batch: 2, timeSec: 4 },
    },
    {
      result: 'pearl_black',
      station: 'mesa',
      ingredients: [
        { key: 'fish_rare',    qty: 2 },
        { key: 'ore_obsidian', qty: 1 },
      ],
      metadata: { costVcoins: 45, timeSec: 4 },
    },
    {
      result: 'scale_serpent',
      station: 'forja',
      ingredients: [
        { key: 'leather',     qty: 2 },
        { key: 'dust_arcane', qty: 1 },
        { key: 'ore_silver',  qty: 1 },
      ],
      metadata: { costVcoins: 40, timeSec: 5 },
    },
  ];
  for (const r of craftRecipes) {
    const rec = await prisma.craftRecipe.upsert({
      where: { resultItemId: await itemId(r.result) },
      update: { station: r.station, metadata: r.metadata },
      create: { resultItemId: await itemId(r.result), station: r.station, metadata: r.metadata },
    });
    await prisma.craftIngredient.deleteMany({ where: { recipeId: rec.id } });
    const ingredientsData = [] as { recipeId: number; itemId: number; quantity: number }[];
    for (const ing of r.ingredients) {
      ingredientsData.push({ recipeId: rec.id, itemId: await itemId(ing.key), quantity: ing.qty });
    }
    if (ingredientsData.length) {
      await prisma.craftIngredient.createMany({ data: ingredientsData });
    }
  }

  // ======================================================
  // LOCATIONS (con slug)
  // ======================================================
  const rawLocations = [
    // Minas
    { name: 'Mina Pedregosa',    kind: LocationKind.MINE,    requiredKind: ToolKind.PICKAXE, requiredTier: 1, dangerLevel: 0, metadata: { drop: ['ore_copper','ore_tin'],        multi: 1.0 } },
    { name: 'Mina Profunda',     kind: LocationKind.MINE,    requiredKind: ToolKind.PICKAXE, requiredTier: 3, dangerLevel: 1, metadata: { drop: ['ore_iron','ore_silver','ore_gold'], multi: 1.2 } },
    { name: 'Abismo Cristalino', kind: LocationKind.MINE,    requiredKind: ToolKind.PICKAXE, requiredTier: 5, dangerLevel: 2, metadata: { drop: ['ore_gold','gem_sapphire'],     multi: 1.5 } },

    // Pesca
    { name: 'Lago Tranquilo',    kind: LocationKind.FISHING, requiredKind: ToolKind.ROD,     requiredTier: 1, dangerLevel: 0, metadata: { drop: ['fish_common'],                multi: 1.0 } },
    { name: 'Costa Ventosa',     kind: LocationKind.FISHING, requiredKind: ToolKind.ROD,     requiredTier: 2, dangerLevel: 0, metadata: { drop: ['fish_common','fish_rare'],    multi: 1.2 } },
    { name: 'Mar de Estrellas',  kind: LocationKind.FISHING, requiredKind: ToolKind.ROD,     requiredTier: 4, dangerLevel: 0, metadata: { drop: ['fish_rare'],                  multi: 1.5 } },

    // Dungeons / combate
    { name: 'Cueva Goblin',      kind: LocationKind.DUNGEON, requiredKind: ToolKind.WEAPON,  requiredTier: 1, dangerLevel: 1, metadata: { loseOnDeath: { vcoinsPct: 0.05, items: ['fish_common'] } } },
    { name: 'Fosas de Cristal',  kind: LocationKind.DUNGEON, requiredKind: ToolKind.WEAPON,  requiredTier: 3, dangerLevel: 3, metadata: { loseOnDeath: { vcoinsPct: 0.1,  items: ['ore_copper','ore_iron'] } } },
  ];

  for (const loc of rawLocations.map(l => ({ slug: slugify(l.name), ...l }))) {
    await prisma.location.upsert({
      where:  { slug: loc.slug },
      update: { name: loc.name, kind: loc.kind, requiredKind: loc.requiredKind, requiredTier: loc.requiredTier, dangerLevel: loc.dangerLevel, metadata: loc.metadata },
      create: loc,
    });
  }

  // ======================================================
  // DROP TABLES & MONSTERS
  // ======================================================
  const goblinDT = await prisma.dropTable.upsert({
    where: { key: 'dt_goblin' },
    update: {},
    create: { key: 'dt_goblin', name: 'Drops Goblin' },
  });

  const crystalDT = await prisma.dropTable.upsert({
    where: { key: 'dt_crystal' },
    update: {},
    create: { key: 'dt_crystal', name: 'Drops Gólem Cristalino' },
  });

  await prisma.dropEntry.createMany({
    data: [
      { tableId: goblinDT.id,  itemId: await itemId('leather'),      weight: 8,  minQty: 1, maxQty: 2 },
      { tableId: goblinDT.id,  itemId: await itemId('slime'),        weight: 5,  minQty: 1, maxQty: 3 },
      { tableId: goblinDT.id,  itemId: await itemId('potion_small'), weight: 1,  minQty: 1, maxQty: 1 },

      { tableId: crystalDT.id, itemId: await itemId('ore_silver'),   weight: 6,  minQty: 1, maxQty: 2 },
      { tableId: crystalDT.id, itemId: await itemId('gem_sapphire'), weight: 3,  minQty: 1, maxQty: 1 },
      { tableId: crystalDT.id, itemId: await itemId('core_mythic'),  weight: 1,  minQty: 1, maxQty: 1 },
      { tableId: crystalDT.id, itemId: await itemId('potion_large'), weight: 1,  minQty: 1, maxQty: 1 },
    ],
    skipDuplicates: true,
  });

  const goblin = await prisma.monster.upsert({
    where: { key: 'mob_goblin' },
    update: {},
    create: {
      key: 'mob_goblin', name: 'Goblin', level: 2, hp: 50, attack: 8, defense: 2,
      critChance: 0.05, xpReward: 8, vcoinsMin: 3, vcoinsMax: 10, dropTableId: goblinDT.id,
    },
  });

  const goblinChief = await prisma.monster.upsert({
    where: { key: 'mob_goblin_chief' },
    update: {},
    create: {
      key: 'mob_goblin_chief', name: 'Jefe Goblin', level: 4, hp: 120, attack: 14, defense: 5,
      critChance: 0.08, xpReward: 20, vcoinsMin: 10, vcoinsMax: 25, dropTableId: goblinDT.id,
      metadata: { elite: true },
    },
  });

  const crystalGolem = await prisma.monster.upsert({
    where: { key: 'mob_crystal_golem' },
    update: {},
    create: {
      key: 'mob_crystal_golem', name: 'Gólem de Cristal', level: 6, hp: 220, attack: 22, defense: 12,
      critChance: 0.06, xpReward: 40, vcoinsMin: 20, vcoinsMax: 45, dropTableId: crystalDT.id,
    },
  });

  const locGoblin = await prisma.location.findUniqueOrThrow({ where: { slug: slugify('Cueva Goblin') } });
  const locFosas  = await prisma.location.findUniqueOrThrow({ where: { slug: slugify('Fosas de Cristal') } });

  await prisma.locationEncounter.createMany({
    data: [
      { locationId: locGoblin.id, monsterId: goblin.id,      weight: 8 },
      { locationId: locGoblin.id, monsterId: goblinChief.id, weight: 2 },
      { locationId: locFosas.id,  monsterId: crystalGolem.id,weight: 10 },
    ],
    skipDuplicates: true,
  });

  console.log('Seed done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
}).finally(async () => {
  await prisma.$disconnect();
});