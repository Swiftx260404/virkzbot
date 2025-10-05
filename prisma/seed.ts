import { PrismaClient, ToolKind, ItemType, LocationKind } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  // Items: pickaxes
  const items = [
    { key: 'pick_wood', name: 'Pico de Madera', type: ItemType.TOOL, price: 50, toolKind: ToolKind.PICKAXE, tier: 1, power: 1 },
    { key: 'pick_stone', name: 'Pico de Piedra', type: ItemType.TOOL, price: 150, toolKind: ToolKind.PICKAXE, tier: 2, power: 2 },
    { key: 'pick_iron', name: 'Pico de Hierro', type: ItemType.TOOL, price: 400, toolKind: ToolKind.PICKAXE, tier: 3, power: 3 },
    { key: 'pick_diamond', name: 'Pico de Diamante', type: ItemType.TOOL, price: 1200, toolKind: ToolKind.PICKAXE, tier: 4, power: 4 },
    { key: 'pick_mythic', name: 'Pico Mítico', type: ItemType.TOOL, price: 3000, toolKind: ToolKind.PICKAXE, tier: 5, power: 5 },

    // Rods
    { key: 'rod_basic', name: 'Caña Básica', type: ItemType.TOOL, price: 80, toolKind: ToolKind.ROD, tier: 1, power: 1 },
    { key: 'rod_better', name: 'Caña Mejorada', type: ItemType.TOOL, price: 200, toolKind: ToolKind.ROD, tier: 2, power: 2 },
    { key: 'rod_pro', name: 'Caña Pro', type: ItemType.TOOL, price: 600, toolKind: ToolKind.ROD, tier: 3, power: 3 },
    { key: 'rod_elite', name: 'Caña Élite', type: ItemType.TOOL, price: 1500, toolKind: ToolKind.ROD, tier: 4, power: 4 },

    // Materials & consumables
    { key: 'ore_copper', name: 'Mena de Cobre', type: ItemType.MATERIAL, price: 5, toolKind: ToolKind.NONE },
    { key: 'ore_iron', name: 'Mena de Hierro', type: ItemType.MATERIAL, price: 10, toolKind: ToolKind.NONE },
    { key: 'ore_gold', name: 'Mena de Oro', type: ItemType.MATERIAL, price: 25, toolKind: ToolKind.NONE },
    { key: 'fish_common', name: 'Pez Común', type: ItemType.MATERIAL, price: 6, toolKind: ToolKind.NONE },
    { key: 'fish_rare', name: 'Pez Raro', type: ItemType.MATERIAL, price: 20, toolKind: ToolKind.NONE },
    { key: 'bait_basic', name: 'Cebo Básico', type: ItemType.CONSUMABLE, price: 12, toolKind: ToolKind.NONE, metadata: {uses: 5} },
  ];

  for (const it of items) {
    await prisma.item.upsert({
      where: { key: it.key },
      update: it,
      create: it,
    });
  }

  // Locations
  const locations = [
    { name: 'Mina Pedregosa', kind: LocationKind.MINE, requiredKind: ToolKind.PICKAXE, requiredTier: 1, metadata: {drop: ['ore_copper'], multi: 1} },
    { name: 'Mina Profunda', kind: LocationKind.MINE, requiredKind: ToolKind.PICKAXE, requiredTier: 3, metadata: {drop: ['ore_iron','ore_gold'], multi: 1.2} },
    { name: 'Abismo Cristalino', kind: LocationKind.MINE, requiredKind: ToolKind.PICKAXE, requiredTier: 5, metadata: {drop: ['ore_gold'], multi: 1.5} },

    { name: 'Lago Tranquilo', kind: LocationKind.FISHING, requiredKind: ToolKind.ROD, requiredTier: 1, metadata: {drop: ['fish_common'], multi: 1} },
    { name: 'Costa Ventosa', kind: LocationKind.FISHING, requiredKind: ToolKind.ROD, requiredTier: 2, metadata: {drop: ['fish_common','fish_rare'], multi: 1.2} },
    { name: 'Mar de Estrellas', kind: LocationKind.FISHING, requiredKind: ToolKind.ROD, requiredTier: 4, metadata: {drop: ['fish_rare'], multi: 1.5} },
  ];

  for (const loc of locations) {
    await prisma.location.upsert({
      where: { id: 0 }, // slight trick; no unique name; we'll just create
      update: {},
      create: loc,
    });
  }

  console.log('Seed done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
}).finally(async () => {
  await prisma.$disconnect();
});
