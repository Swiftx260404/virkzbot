import { PrismaClient } from '@prisma/client';

export const slugify = (s: string) =>
  s.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

export const getItemId = async (prisma: PrismaClient, key: string) => {
  const row = await prisma.item.findUnique({ where: { key } });
  if (!row) throw new Error(`Item ${key} no encontrado`);
  return row.id;
};
