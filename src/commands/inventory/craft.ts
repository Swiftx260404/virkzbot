import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  StringSelectMenuBuilder,
  ActionRowBuilder,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuInteraction,
  ButtonInteraction,
} from 'discord.js';
import type { CraftRecipe, CraftIngredient, Prisma } from '@prisma/client';
import { prisma } from '../../lib/db.js';

interface RecipeWithRelations extends CraftRecipe {
  resultItem: {
    id: number;
    name: string;
    key: string;
    tier: number | null;
    type: string;
    price: number;
  };
  ingredients: (CraftIngredient & { item: { id: number; name: string } })[];
}

interface RecipeMeta {
  costVcoins: number;
  timeSec?: number;
  batchSize: number;
  notes?: string;
}

function isObject(value: Prisma.JsonValue | null | undefined): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseMeta(metadata: Prisma.JsonValue | null | undefined): RecipeMeta {
  if (!isObject(metadata)) {
    return { costVcoins: 0, batchSize: 1 };
  }
  const meta = metadata as Record<string, any>;
  const cost = Number(meta.costVcoins ?? meta.cost ?? 0);
  const timeSec = meta.timeSec !== undefined ? Number(meta.timeSec) : undefined;
  const batch = Number(meta.batch ?? meta.resultQty ?? 1);
  const notes = typeof meta.notes === 'string' ? meta.notes : undefined;
  return {
    costVcoins: Number.isFinite(cost) ? cost : 0,
    timeSec: Number.isFinite(timeSec ?? NaN) ? timeSec : undefined,
    batchSize: Number.isFinite(batch) && batch > 0 ? Math.floor(batch) : 1,
    notes,
  };
}

function inventoryMap(entries: { itemId: number; quantity: number }[]) {
  const map = new Map<number, number>();
  for (const entry of entries) {
    map.set(entry.itemId, entry.quantity);
  }
  return map;
}

function canCraft(recipe: RecipeWithRelations, inv: Map<number, number>, vcoins: number) {
  const meta = parseMeta(recipe.metadata);
  if (vcoins < meta.costVcoins) return false;
  return recipe.ingredients.every(ing => (inv.get(ing.itemId) ?? 0) >= ing.quantity);
}

function formatIngredientLine(ing: RecipeWithRelations['ingredients'][number], inv: Map<number, number>) {
  const have = inv.get(ing.itemId) ?? 0;
  const ok = have >= ing.quantity;
  return `${ok ? '✅' : '❌'} ${ing.quantity} × ${ing.item.name} (tienes ${have})`;
}

function renderTree(recipe: RecipeWithRelations, recipeMap: Map<number, RecipeWithRelations>, depth = 0, prefix = ''): string[] {
  const lines: string[] = [];
  const children = recipe.ingredients;
  children.forEach((ing, index) => {
    const isLast = index === children.length - 1;
    const branch = depth === 0 ? (isLast ? '└─' : '├─') : `${prefix}${isLast ? '└─' : '├─'}`;
    lines.push(`${branch} ${ing.quantity} × ${ing.item.name}`);
    if (depth >= 2) return;
    const sub = recipeMap.get(ing.itemId);
    if (!sub) return;
    const nextPrefix = depth === 0 ? (isLast ? '   ' : '│  ') : `${prefix}${isLast ? '   ' : '│  '}`;
    const nested = renderTree(sub, recipeMap, depth + 1, nextPrefix);
    nested.forEach(line => lines.push(line));
  });
  return lines;
}

async function fetchRecipes() {
  const recipes = await prisma.craftRecipe.findMany({
    include: {
      resultItem: true,
      ingredients: { include: { item: true } },
    },
    orderBy: { id: 'asc' },
  });
  return recipes as RecipeWithRelations[];
}

function buildSelect(recipes: RecipeWithRelations[], inv: Map<number, number>, vcoins: number, selected?: number) {
  const sorted = [...recipes].sort((a, b) => {
    const aOk = canCraft(a, inv, vcoins) ? 1 : 0;
    const bOk = canCraft(b, inv, vcoins) ? 1 : 0;
    if (aOk !== bOk) return bOk - aOk;
    return a.resultItem.name.localeCompare(b.resultItem.name);
  });

  const options = sorted
    .map(recipe => {
      const meta = parseMeta(recipe.metadata);
      const ok = canCraft(recipe, inv, vcoins);
      const label = `${ok ? '✅' : '⚠️'} ${recipe.resultItem.name}`.slice(0, 95);
      const missing = recipe.ingredients.filter(ing => (inv.get(ing.itemId) ?? 0) < ing.quantity);
      const descParts: string[] = [];
      if (meta.costVcoins > 0) descParts.push(`${meta.costVcoins} V Coins`);
      if (missing.length) descParts.push(`Faltan ${missing.length}`);
      const description = descParts.join(' · ').slice(0, 100) || 'Receta disponible';
      return {
        label,
        value: String(recipe.id),
        description,
        default: selected === recipe.id,
      };
    })
    .slice(0, 25);

  const menu = new StringSelectMenuBuilder()
    .setCustomId('craft:select')
    .setPlaceholder('Elige una receta')
    .addOptions(options);

  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
}

function buildPreviewEmbed(
  recipe: RecipeWithRelations,
  inv: Map<number, number>,
  vcoins: number,
  recipeMap: Map<number, RecipeWithRelations>,
) {
  const meta = parseMeta(recipe.metadata);
  const ok = canCraft(recipe, inv, vcoins);
  const tree = renderTree(recipe, recipeMap);
  const materials = recipe.ingredients.map(ing => formatIngredientLine(ing, inv)).join('\n');
  const fields = [
    { name: 'Materiales', value: materials || '—', inline: false },
  ];
  if (meta.costVcoins > 0 || meta.timeSec) {
    const costParts: string[] = [];
    if (meta.costVcoins > 0) costParts.push(`${meta.costVcoins} V Coins`);
    if (meta.timeSec) costParts.push(`${Math.round(meta.timeSec)}s`);
    fields.push({ name: 'Coste / Tiempo', value: costParts.join(' · '), inline: true });
  }
  if (meta.notes) {
    fields.push({ name: 'Notas', value: meta.notes, inline: false });
  }
  if (tree.length) {
    fields.push({ name: 'Árbol', value: '```' + tree.join('\n') + '```', inline: false });
  }

  const embed = new EmbedBuilder()
    .setColor(ok ? 0x2ecc71 : 0xe67e22)
    .setTitle(`Craftear ${recipe.resultItem.name}${meta.batchSize > 1 ? ` ×${meta.batchSize}` : ''}`)
    .setDescription(
      ok
        ? 'Tienes todo lo necesario para fabricar esta receta.'
        : 'Aún te faltan materiales o V Coins.',
    )
    .addFields(fields)
    .setFooter({ text: `Recompensa: ${meta.batchSize} × ${recipe.resultItem.name}` });

  return { embed, ok };
}

async function buildContext(userId: string) {
  const [user, recipes, inventory] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    fetchRecipes(),
    prisma.userItem.findMany({ where: { userId }, select: { itemId: true, quantity: true } }),
  ]);
  return { user, recipes, inventory };
}

export default {
  data: new SlashCommandBuilder()
    .setName('craft')
    .setDescription('Combina materiales para fabricar nuevos ítems.'),
  ns: 'craft',
  async execute(interaction: ChatInputCommandInteraction) {
    const userId = interaction.user.id;
    const { user, recipes, inventory } = await buildContext(userId);
    if (!user) {
      await interaction.reply({ content: 'Primero usa `/start` para crear tu perfil.', ephemeral: true });
      return;
    }
    if (!recipes.length) {
      await interaction.reply({ content: 'No hay recetas configuradas todavía.', ephemeral: true });
      return;
    }

    const invMap = inventoryMap(inventory);
    const selectRow = buildSelect(recipes, invMap, user.vcoins);
    const available = recipes.filter(recipe => canCraft(recipe, invMap, user.vcoins)).length;

    const embed = new EmbedBuilder()
      .setColor(0x3498db)
      .setTitle('Crafteo')
      .setDescription('Selecciona una receta para ver los requisitos y confirmarla.')
      .addFields(
        { name: 'Recetas totales', value: String(recipes.length), inline: true },
        { name: 'Disponibles', value: String(available), inline: true },
        { name: 'V Coins', value: String(user.vcoins), inline: true },
      );

    await interaction.reply({ embeds: [embed], components: [selectRow], ephemeral: true });
  },
  async handleInteraction(interaction: StringSelectMenuInteraction | ButtonInteraction) {
    if (interaction.isStringSelectMenu() && interaction.customId === 'craft:select') {
      const userId = interaction.user.id;
      const recipeId = Number(interaction.values[0]);
      if (!Number.isInteger(recipeId)) {
        await interaction.reply({ content: 'Receta inválida.', ephemeral: true });
        return;
      }
      const { user, recipes, inventory } = await buildContext(userId);
      if (!user) {
        await interaction.reply({ content: 'Primero usa `/start`.', ephemeral: true });
        return;
      }
      const recipe = recipes.find(r => r.id === recipeId);
      if (!recipe) {
        await interaction.reply({ content: 'No encontré esa receta.', ephemeral: true });
        return;
      }
      const map = inventoryMap(inventory);
      const recipeMap = new Map(recipes.map(r => [r.resultItemId, r]));
      const { embed, ok } = buildPreviewEmbed(recipe, map, user.vcoins, recipeMap);
      const selectRow = buildSelect(recipes, map, user.vcoins, recipeId);
      const confirm = new ButtonBuilder()
        .setCustomId(`craft:confirm:${userId}:${recipeId}`)
        .setLabel('Fabricar')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(!ok);
      const cancel = new ButtonBuilder()
        .setCustomId('craft:cancel')
        .setLabel('Cancelar')
        .setStyle(ButtonStyle.Secondary);
      const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(confirm, cancel);
      await interaction.update({ embeds: [embed], components: [selectRow, buttons] });
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('craft:')) {
      const parts = interaction.customId.split(':');
      const action = parts[1];
      if (action === 'cancel') {
        await interaction.update({ content: 'Crafteo cancelado.', components: [], embeds: [] });
        return;
      }
      if (action !== 'confirm') return;

      const targetUser = parts[2];
      const recipeId = Number(parts[3]);
      if (interaction.user.id !== targetUser || !Number.isInteger(recipeId)) {
        await interaction.reply({ content: 'No puedes confirmar este crafteo.', ephemeral: true });
        return;
      }

      try {
        const result = await prisma.$transaction(async tx => {
          const recipe = await tx.craftRecipe.findUnique({
            where: { id: recipeId },
            include: { resultItem: true, ingredients: true },
          });
          if (!recipe) throw new Error('NOT_FOUND');
          const meta = parseMeta(recipe.metadata);
          const user = await tx.user.findUnique({ where: { id: targetUser } });
          if (!user) throw new Error('NO_USER');
          if (user.vcoins < meta.costVcoins) throw new Error('NO_COINS');

          const invEntries = await tx.userItem.findMany({
            where: { userId: targetUser },
            select: { itemId: true, quantity: true },
          });
          const inv = inventoryMap(invEntries);
          const missing = recipe.ingredients.filter(ing => (inv.get(ing.itemId) ?? 0) < ing.quantity);
          if (missing.length) throw new Error('NO_MATERIALS');

          if (meta.costVcoins > 0) {
            await tx.user.update({
              where: { id: targetUser },
              data: { vcoins: { decrement: meta.costVcoins } },
            });
          }

          for (const ing of recipe.ingredients) {
            const entry = await tx.userItem.findUnique({ where: { userId_itemId: { userId: targetUser, itemId: ing.itemId } } });
            if (!entry || entry.quantity < ing.quantity) throw new Error('NO_MATERIALS');
            if (entry.quantity === ing.quantity) {
              await tx.userItem.delete({ where: { userId_itemId: { userId: targetUser, itemId: ing.itemId } } });
            } else {
              await tx.userItem.update({
                where: { userId_itemId: { userId: targetUser, itemId: ing.itemId } },
                data: { quantity: { decrement: ing.quantity } },
              });
            }
          }

          const qty = meta.batchSize;
          await tx.userItem.upsert({
            where: { userId_itemId: { userId: targetUser, itemId: recipe.resultItemId } },
            update: { quantity: { increment: qty } },
            create: { userId: targetUser, itemId: recipe.resultItemId, quantity: qty },
          });

          return { resultName: recipe.resultItem.name, qty, cost: meta.costVcoins };
        });

        const embed = new EmbedBuilder()
          .setColor(0x2ecc71)
          .setTitle('Crafteo completado')
          .setDescription(`Has creado ${result.qty} × ${result.resultName}.`)
          .addFields(
            ...(result.cost > 0
              ? [{ name: 'Coste', value: `${result.cost} V Coins`, inline: true }]
              : []),
          );
        await interaction.update({ embeds: [embed], components: [] });
      } catch (error: any) {
        const reason = error?.message ?? 'ERROR';
        const message =
          reason === 'NO_COINS'
            ? 'No tienes suficientes V Coins.'
            : reason === 'NO_MATERIALS'
              ? 'Te faltan materiales para esta receta.'
              : 'No se pudo completar el crafteo.';
        await interaction.update({ content: message, components: [], embeds: [] });
      }
    }
  },
};
