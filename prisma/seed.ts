import { PrismaClient } from '@prisma/client';
import { seedItems } from './seed-data/items.js';
import { seedEffects } from './seed-data/effects.js';
import { seedDisassemble } from './seed-data/disassemble.js';
import { seedUpgrades } from './seed-data/upgrades.js';
import { seedCrafting } from './seed-data/crafting.js';
import { seedLocations } from './seed-data/locations.js';
import { seedDropTables } from './seed-data/drops.js';
import { seedPets } from './seed-data/pets.js';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding items…');
  const itemIds = await seedItems(prisma);

  console.log('✨ Seeding efectos…');
  await seedEffects(prisma, itemIds);

  console.log('🧩 Configurando desarmes…');
  await seedDisassemble(prisma);

  console.log('⚙️ Cargando upgrades…');
  await seedUpgrades(prisma);

  console.log('🧪 Cargando recetas…');
  await seedCrafting(prisma);

  console.log('🌍 Registrando ubicaciones…');
  const locationIds = await seedLocations(prisma);

  console.log('🎲 Generando tablas de drop y encuentros…');
  await seedDropTables(prisma, locationIds);

  console.log('🐾 Registrando mascotas…');
  await seedPets(prisma);

  console.log('✅ Seed completado.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
}).finally(async () => {
  await prisma.$disconnect();
});
