import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  EmbedBuilder
} from 'discord.js';
import { ItemType, MarketListingStatus } from '@prisma/client';
import { prisma } from '../../lib/db.js';
import { ensureInventoryCapacity } from '../../services/inventory.js';
import { CONFIG } from '../../config.js';

const PAGE_SIZE = 5;

function formatListingField(listing: any) {
  const totalPrice = listing.price * listing.remainingQty;
  return `ID **${listing.id}** · ${listing.remainingQty}/${listing.qty} disponibles\nPrecio: ${listing.price} V c/u (total ${totalPrice} V)\nVendedor: <@${listing.sellerId}>`;
}

async function autocompleteInventory(interaction: AutocompleteInteraction) {
  const query = (interaction.options.getFocused() ?? '').toString().toLowerCase();
  const rows = await prisma.userItem.findMany({
    where: { userId: interaction.user.id, quantity: { gt: 0 } },
    include: { item: true },
    take: 25
  });
  const options = rows
    .filter((row) => {
      const name = row.item?.name?.toLowerCase() ?? '';
      const key = row.item?.key?.toLowerCase() ?? '';
      if (!query) return true;
      return name.includes(query) || key.includes(query);
    })
    .slice(0, 25)
    .map((row) => ({
      name: `${row.item?.name ?? 'Ítem'} — ${row.quantity} disponibles`,
      value: row.item?.key ?? String(row.itemId)
    }));
  await interaction.respond(options);
}

export default {
  data: new SlashCommandBuilder()
    .setName('market')
    .setDescription('Administra listados del mercado entre jugadores.')
    .addSubcommand((sub) =>
      sub
        .setName('list')
        .setDescription('Publica un ítem a la venta.')
        .addStringOption((opt) =>
          opt.setName('item').setDescription('Ítem a vender').setRequired(true).setAutocomplete(true)
        )
        .addIntegerOption((opt) =>
          opt.setName('cantidad').setDescription('Cantidad a vender').setRequired(true).setMinValue(1)
        )
        .addIntegerOption((opt) =>
          opt.setName('precio').setDescription('Precio por unidad').setRequired(true).setMinValue(1)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('browse')
        .setDescription('Explora listados del mercado.')
        .addStringOption((opt) =>
          opt
            .setName('query')
            .setDescription('Filtrar por nombre')
        )
        .addStringOption((opt) =>
          opt
            .setName('categoria')
            .setDescription('Filtrar por tipo de ítem')
            .addChoices(...Object.values(ItemType).map((type) => ({ name: type, value: type })))
        )
        .addIntegerOption((opt) =>
          opt
            .setName('pagina')
            .setDescription('Página a mostrar')
            .setMinValue(1)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('buy')
        .setDescription('Compra de un listado.')
        .addIntegerOption((opt) =>
          opt.setName('id').setDescription('ID del listado').setRequired(true).setMinValue(1)
        )
        .addIntegerOption((opt) =>
          opt.setName('cantidad').setDescription('Cantidad a comprar').setMinValue(1)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('cancel')
        .setDescription('Cancela tu propio listado y recupera el stock restante.')
        .addIntegerOption((opt) =>
          opt.setName('id').setDescription('ID del listado').setRequired(true).setMinValue(1)
        )
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'list') {
      const itemKey = interaction.options.getString('item', true);
      const quantity = interaction.options.getInteger('cantidad', true);
      const price = interaction.options.getInteger('precio', true);
      const user = await prisma.user.findUnique({ where: { id: interaction.user.id } });
      if (!user) {
        await interaction.reply({ content: 'Usa `/start` primero.', ephemeral: true });
        return;
      }

      try {
        const listing = await prisma.$transaction(async (tx) => {
          const item = await tx.item.findFirst({
            where: {
              OR: [
                { key: { equals: itemKey, mode: 'insensitive' } },
                { name: { equals: itemKey, mode: 'insensitive' } }
              ]
            }
          });
          if (!item) throw new Error('NO_ITEM');

          const inventory = await tx.userItem.findUnique({
            where: { userId_itemId: { userId: interaction.user.id, itemId: item.id } }
          });
          if (!inventory || inventory.quantity < quantity) throw new Error('NOT_ENOUGH');

          if (inventory.quantity === quantity) {
            await tx.userItem.delete({ where: { userId_itemId: { userId: interaction.user.id, itemId: item.id } } });
          } else {
            await tx.userItem.update({
              where: { userId_itemId: { userId: interaction.user.id, itemId: item.id } },
              data: { quantity: { decrement: quantity } }
            });
          }

          const listing = await tx.marketListing.create({
            data: {
              sellerId: interaction.user.id,
              itemId: item.id,
              qty: quantity,
              remainingQty: quantity,
              price,
              status: MarketListingStatus.ACTIVE
            }
          });
          return { listing, item };
        });

        await interaction.reply({
          content: `📦 Listado creado (#${listing.listing.id}) para ${quantity} × ${listing.item.name} a ${price} V c/u.`,
          ephemeral: true
        });
      } catch (error: any) {
        const reason = error?.message ?? 'ERROR';
        const message =
          reason === 'NO_ITEM'
            ? 'No encontré ese ítem.'
            : reason === 'NOT_ENOUGH'
              ? 'No tienes suficientes unidades en tu inventario.'
              : 'No se pudo crear el listado.';
        await interaction.reply({ content: message, ephemeral: true });
      }
      return;
    }

    if (sub === 'browse') {
      const page = interaction.options.getInteger('pagina') ?? 1;
      const skip = (page - 1) * PAGE_SIZE;
      const query = interaction.options.getString('query');
      const category = interaction.options.getString('categoria') as ItemType | null;

      const where: any = {
        status: MarketListingStatus.ACTIVE,
        remainingQty: { gt: 0 }
      };
      if (query) {
        where.item = {
          ...where.item,
          name: { contains: query, mode: 'insensitive' }
        };
      }
      if (category) {
        where.item = {
          ...(where.item ?? {}),
          type: category
        };
      }

      const [total, listings] = await Promise.all([
        prisma.marketListing.count({ where }),
        prisma.marketListing.findMany({
          where,
          include: { item: true },
          orderBy: { createdAt: 'asc' },
          skip,
          take: PAGE_SIZE
        })
      ]);

      if (!listings.length) {
        await interaction.reply({ content: 'No hay listados que coincidan con el filtro.', ephemeral: true });
        return;
      }

      const embed = new EmbedBuilder()
        .setColor(0x3498db)
        .setTitle('🛒 Mercado de jugadores')
        .setFooter({ text: `Página ${page} · ${total} listados` });

      for (const listing of listings) {
        embed.addFields({
          name: `${listing.item?.name ?? 'Ítem desconocido'} — ${listing.price} V`,
          value: formatListingField(listing)
        });
      }

      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }

    if (sub === 'buy') {
      const id = interaction.options.getInteger('id', true);
      const qty = interaction.options.getInteger('cantidad') ?? 1;
      if (qty <= 0) {
        await interaction.reply({ content: 'La cantidad debe ser positiva.', ephemeral: true });
        return;
      }

      try {
        const summary = await prisma.$transaction(async (tx) => {
          const listing = await tx.marketListing.findUnique({
            where: { id },
            include: { item: true }
          });
          if (!listing || listing.status !== MarketListingStatus.ACTIVE || listing.remainingQty <= 0) {
            throw new Error('NOT_AVAILABLE');
          }
          if (listing.sellerId === interaction.user.id) throw new Error('OWN_LISTING');
          if (qty > listing.remainingQty) throw new Error('NOT_ENOUGH');

          const cost = listing.price * qty;
          const buyer = await tx.user.findUnique({ where: { id: interaction.user.id } });
          if (!buyer || buyer.vcoins < cost) throw new Error('NO_COINS');

          await ensureInventoryCapacity(tx, interaction.user.id, qty);

          const remaining = listing.remainingQty - qty;
          const commission = Math.floor(cost * CONFIG.marketCommissionRate);
          const payout = cost - commission;

          await tx.user.update({ where: { id: interaction.user.id }, data: { vcoins: { decrement: cost } } });
          if (payout > 0) {
            await tx.user.update({ where: { id: listing.sellerId }, data: { vcoins: { increment: payout } } });
          }

          await tx.marketListing.update({
            where: { id },
            data: {
              remainingQty: remaining,
              status: remaining > 0 ? MarketListingStatus.ACTIVE : MarketListingStatus.COMPLETED
            }
          });

          await tx.userItem.upsert({
            where: { userId_itemId: { userId: interaction.user.id, itemId: listing.itemId } },
            update: { quantity: { increment: qty } },
            create: { userId: interaction.user.id, itemId: listing.itemId, quantity: qty }
          });

          await tx.marketTx.create({
            data: {
              listingId: listing.id,
              buyerId: interaction.user.id,
              qty,
              price: listing.price
            }
          });

          return { listing, qty, cost, commission, payout };
        });

        const feeText = summary.commission > 0 ? ` (comisión ${summary.commission} V)` : '';
        await interaction.reply({
          content: `✅ Compraste ${summary.qty} × ${summary.listing.item?.name ?? 'ítem'} por ${summary.cost} V${feeText}.`,
          ephemeral: true
        });
      } catch (error: any) {
        const reason = error?.message ?? 'ERROR';
        const message =
          reason === 'NOT_AVAILABLE'
            ? 'El listado ya no está disponible.'
            : reason === 'NOT_ENOUGH'
              ? 'No hay suficiente stock en ese listado.'
              : reason === 'NO_COINS'
                ? 'No tienes suficientes V Coins.'
                : reason === 'OWN_LISTING'
                  ? 'No puedes comprar tu propio listado.'
                  : reason === 'INVENTORY_FULL'
                    ? 'No tienes espacio en el inventario.'
                    : 'No se pudo completar la compra.';
        await interaction.reply({ content: message, ephemeral: true });
      }
      return;
    }

    if (sub === 'cancel') {
      const id = interaction.options.getInteger('id', true);
      try {
        const result = await prisma.$transaction(async (tx) => {
          const listing = await tx.marketListing.findUnique({ where: { id } });
          if (!listing || listing.sellerId !== interaction.user.id) throw new Error('NOT_OWNER');
          if (listing.status !== MarketListingStatus.ACTIVE || listing.remainingQty <= 0) throw new Error('NOT_AVAILABLE');

          await ensureInventoryCapacity(tx, interaction.user.id, listing.remainingQty);

          await tx.userItem.upsert({
            where: { userId_itemId: { userId: interaction.user.id, itemId: listing.itemId } },
            update: { quantity: { increment: listing.remainingQty } },
            create: { userId: interaction.user.id, itemId: listing.itemId, quantity: listing.remainingQty }
          });

          await tx.marketListing.update({
            where: { id },
            data: { remainingQty: 0, status: MarketListingStatus.CANCELLED }
          });

          return listing.remainingQty;
        });

        await interaction.reply({ content: `🚫 Listado cancelado. Recuperaste ${result} unidades.`, ephemeral: true });
      } catch (error: any) {
        const reason = error?.message ?? 'ERROR';
        const message =
          reason === 'NOT_OWNER'
            ? 'Solo el vendedor puede cancelar el listado.'
            : reason === 'NOT_AVAILABLE'
              ? 'El listado ya no se puede cancelar.'
              : reason === 'INVENTORY_FULL'
                ? 'No tienes espacio suficiente para recuperar el stock.'
                : 'No se pudo cancelar el listado.';
        await interaction.reply({ content: message, ephemeral: true });
      }
      return;
    }
  },
  async autocomplete(interaction: AutocompleteInteraction) {
    if (interaction.options.getSubcommand() === 'list') {
      await autocompleteInventory(interaction);
    } else {
      await interaction.respond([]);
    }
  }
};
