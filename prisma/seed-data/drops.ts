import { PrismaClient } from '@prisma/client';
import { getItemId, slugify } from './utils.js';

type DropEntryCfg = { itemKey: string; weight: number; minQty?: number; maxQty?: number };

type DropTableCfg = {
  key: string;
  name: string;
  entries: DropEntryCfg[];
};

type MonsterCfg = {
  key: string;
  name: string;
  level: number;
  hp: number;
  attack: number;
  defense: number;
  critChance?: number;
  xpReward: number;
  vcoinsMin: number;
  vcoinsMax: number;
  dropTableKey: string;
  metadata?: Record<string, unknown>;
};

type EncounterCfg = {
  locationName: string;
  monsterKey: string;
  weight: number;
};

const tables: DropTableCfg[] = [
  {
    key: 'dt_goblin',
    name: 'Botín Goblin',
    entries: [
      { itemKey: 'leather', weight: 8, minQty: 1, maxQty: 2 },
      { itemKey: 'snack_dried', weight: 6, minQty: 1, maxQty: 2 },
      { itemKey: 'potion_small', weight: 3, minQty: 1, maxQty: 1 },
      { itemKey: 'ore_copper', weight: 5, minQty: 1, maxQty: 2 },
    ],
  },
  {
    key: 'dt_crystal',
    name: 'Fragmentos Cristalinos',
    entries: [
      { itemKey: 'ore_silver', weight: 6, minQty: 1, maxQty: 2 },
      { itemKey: 'gem_amethyst', weight: 4, minQty: 1, maxQty: 1 },
      { itemKey: 'dust_arcane', weight: 5, minQty: 1, maxQty: 2 },
      { itemKey: 'potion_large', weight: 2, minQty: 1, maxQty: 1 },
    ],
  },
  {
    key: 'dt_echo',
    name: 'Resonancias del Eco',
    entries: [
      { itemKey: 'dust_gilded', weight: 5, minQty: 1, maxQty: 2 },
      { itemKey: 'gem_topaz', weight: 4, minQty: 1, maxQty: 1 },
      { itemKey: 'scroll_luck', weight: 2, minQty: 1, maxQty: 1 },
      { itemKey: 'incense_night', weight: 3, minQty: 1, maxQty: 1 },
    ],
  },
  {
    key: 'dt_leviathan',
    name: 'Tesoro del Leviatán',
    entries: [
      { itemKey: 'fish_leviathan_scale', weight: 6, minQty: 1, maxQty: 2 },
      { itemKey: 'bait_abyss', weight: 4, minQty: 1, maxQty: 1 },
      { itemKey: 'core_astral', weight: 1, minQty: 1, maxQty: 1 },
    ],
  },
];

const monsters: MonsterCfg[] = [
  { key: 'mob_goblin', name: 'Goblin', level: 2, hp: 60, attack: 9, defense: 3, critChance: 0.05, xpReward: 12, vcoinsMin: 5, vcoinsMax: 12, dropTableKey: 'dt_goblin' },
  { key: 'mob_goblin_chief', name: 'Jefe Goblin', level: 4, hp: 140, attack: 16, defense: 6, critChance: 0.08, xpReward: 24, vcoinsMin: 12, vcoinsMax: 28, dropTableKey: 'dt_goblin', metadata: { elite: true } },
  { key: 'mob_crystal_golem', name: 'Gólem Cristalino', level: 6, hp: 260, attack: 24, defense: 14, critChance: 0.06, xpReward: 48, vcoinsMin: 18, vcoinsMax: 40, dropTableKey: 'dt_crystal' },
  { key: 'mob_echo_wraith', name: 'Espectro de Eco', level: 8, hp: 320, attack: 32, defense: 16, critChance: 0.1, xpReward: 70, vcoinsMin: 28, vcoinsMax: 55, dropTableKey: 'dt_echo', metadata: { phasing: true } },
  { key: 'raid_leviathan', name: 'Leviatán Abisal', level: 10, hp: 1800, attack: 64, defense: 28, critChance: 0.12, xpReward: 260, vcoinsMin: 120, vcoinsMax: 220, dropTableKey: 'dt_leviathan', metadata: { raidBoss: true } },
];

const encounters: EncounterCfg[] = [
  { locationName: 'Cueva Goblin', monsterKey: 'mob_goblin', weight: 8 },
  { locationName: 'Cueva Goblin', monsterKey: 'mob_goblin_chief', weight: 2 },
  { locationName: 'Fosas de Cristal', monsterKey: 'mob_crystal_golem', weight: 10 },
  { locationName: 'Santuario del Eco', monsterKey: 'mob_echo_wraith', weight: 10 },
  { locationName: 'Simas del Leviatán', monsterKey: 'raid_leviathan', weight: 1 },
];

export async function seedDropTables(prisma: PrismaClient, slugToId: Map<string, number>) {
  const tableIds = new Map<string, number>();

  for (const table of tables) {
    const stored = await prisma.dropTable.upsert({
      where: { key: table.key },
      update: { name: table.name },
      create: { key: table.key, name: table.name },
    });
    tableIds.set(table.key, stored.id);

    await prisma.dropEntry.deleteMany({ where: { tableId: stored.id } });
    if (table.entries.length) {
      const data = await Promise.all(
        table.entries.map(async (entry) => ({
          tableId: stored.id,
          itemId: await getItemId(prisma, entry.itemKey),
          weight: entry.weight,
          minQty: entry.minQty ?? 1,
          maxQty: entry.maxQty ?? entry.minQty ?? 1,
        })),
      );
      await prisma.dropEntry.createMany({ data });
    }
  }

  const monsterIds = new Map<string, number>();
  for (const monster of monsters) {
    const dropTableId = tableIds.get(monster.dropTableKey);
    if (!dropTableId) throw new Error(`Drop table ${monster.dropTableKey} no existe`);

    const stored = await prisma.monster.upsert({
      where: { key: monster.key },
      update: {
        name: monster.name,
        level: monster.level,
        hp: monster.hp,
        attack: monster.attack,
        defense: monster.defense,
        critChance: monster.critChance ?? 0.05,
        xpReward: monster.xpReward,
        vcoinsMin: monster.vcoinsMin,
        vcoinsMax: monster.vcoinsMax,
        dropTableId,
        metadata: monster.metadata ?? null,
      },
      create: {
        key: monster.key,
        name: monster.name,
        level: monster.level,
        hp: monster.hp,
        attack: monster.attack,
        defense: monster.defense,
        critChance: monster.critChance ?? 0.05,
        xpReward: monster.xpReward,
        vcoinsMin: monster.vcoinsMin,
        vcoinsMax: monster.vcoinsMax,
        dropTableId,
        metadata: monster.metadata ?? null,
      },
    });
    monsterIds.set(monster.key, stored.id);
  }

  for (const encounter of encounters) {
    const slug = slugify(encounter.locationName);
    const locationId = slugToId.get(slug);
    if (!locationId) continue;
    const monsterId = monsterIds.get(encounter.monsterKey);
    if (!monsterId) continue;

    await prisma.locationEncounter.upsert({
      where: { locationId_monsterId: { locationId, monsterId } },
      update: { weight: encounter.weight },
      create: { locationId, monsterId, weight: encounter.weight },
    });
  }
}
