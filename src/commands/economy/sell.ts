import {
  ActionRowBuilder,
  AutocompleteInteraction,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder
} from 'discord.js';
import { prisma } from '../../lib/db.js';

function formatNumber(value: number) {
  return value.toLocaleString('es-ES');
}

async function fetchSellableInventory(userId: string) {
  const items = await prisma.userItem.findMany({
    where: { userId, quantity: { gt: 0 } },
    include: { item: true }
  });
  return items.filter((entry) => (entry.item?.price ?? 0) > 0);
}

export default {
  data: new SlashCommandBuilder()
    .setName('sell')
    .setDescription('Vende ítems al sistema a cambio de V Coins.')
    .addStringOption((option) =>
      option
        .setName('item')
        .setDescription('Ítem de tu inventario que quieres vender')
        .setAutocomplete(true)
        .setRequired(true)
    )
    .addIntegerOption((option) =>
      option
        .setName('cantidad')
        .setDescription('Cantidad a vender')
        .setMinValue(1)
    ),
  ns: 'sell',
  async autocomplete(interaction: AutocompleteInteraction) {
    const focused = interaction.options.getFocused(true);
    if (focused.name !== 'item') return;

    const query = focused.value.toLowerCase();
    const sellable = await fetchSellableInventory(interaction.user.id);

    const choices = sellable
      .filter((entry) => {
        const key = `${entry.item?.name ?? ''} ${entry.item?.key ?? ''}`.toLowerCase();
        return key.includes(query);
      })
      .slice(0, 25)
      .map((entry) => ({
        name: `${entry.item?.name ?? 'Desconocido'} (${entry.quantity} disponibles)`,
        value: String(entry.itemId)
      }));

    await interaction.respond(choices);
  },
  async execute(interaction: ChatInputCommandInteraction) {
    const userId = interaction.user.id;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      await interaction.reply({ content: 'Debes usar `/start` antes de comerciar.', ephemeral: true });
      return;
    }

    const itemIdValue = interaction.options.getString('item', true);
    const quantityOption = interaction.options.getInteger('cantidad') ?? 1;
    const quantity = Math.max(1, quantityOption);

    const itemId = Number(itemIdValue);
    if (!Number.isInteger(itemId)) {
      await interaction.reply({ content: 'Selecciona un ítem válido mediante el autocompletado.', ephemeral: true });
      return;
    }

    const inventory = await prisma.userItem.findUnique({
      where: { userId_itemId: { userId, itemId } },
      include: { item: true }
    });

    if (!inventory || !inventory.item) {
      await interaction.reply({ content: 'No tienes ese ítem en tu inventario.', ephemeral: true });
      return;
    }

    if ((inventory.item.price ?? 0) <= 0) {
      await interaction.reply({ content: 'Ese ítem no se puede vender al sistema.', ephemeral: true });
      return;
    }

    if (inventory.quantity < quantity) {
      await interaction.reply({ content: `Solo tienes ${inventory.quantity} unidades disponibles.`, ephemeral: true });
      return;
    }

    const total = inventory.item.price * quantity;

    const embed = new EmbedBuilder()
      .setColor(0xf47b67)
      .setTitle('Confirmar venta')
      .setDescription(`Vas a vender **${quantity} × ${inventory.item.name}**.`)
      .addFields(
        { name: 'Precio unitario', value: `${formatNumber(inventory.item.price)} V Coins`, inline: true },
        { name: 'Total a recibir', value: `${formatNumber(total)} V Coins`, inline: true }
      )
      .setFooter({ text: 'La venta se completa al confirmar.' });

    const confirm = new ButtonBuilder()
      .setCustomId(`sell:confirm:${userId}:${itemId}:${quantity}`)
      .setLabel('Confirmar')
      .setStyle(ButtonStyle.Success);

    const cancel = new ButtonBuilder()
      .setCustomId(`sell:cancel:${userId}`)
      .setLabel('Cancelar')
      .setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(confirm, cancel);

    await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
  },
  async handleInteraction(interaction: ButtonInteraction) {
    if (!interaction.customId.startsWith('sell:')) return;

    const parts = interaction.customId.split(':');
    const action = parts[1];
    const targetUserId = parts[2];

    if (interaction.user.id !== targetUserId) {
      await interaction.reply({ content: 'Solo el propietario puede gestionar esta venta.', ephemeral: true });
      return;
    }

    if (action === 'cancel') {
      await interaction.update({ content: 'Venta cancelada.', components: [], embeds: [] });
      return;
    }

    if (action === 'confirm') {
      const itemId = Number(parts[3]);
      const quantity = Number(parts[4]);
      if (!Number.isInteger(itemId) || !Number.isInteger(quantity)) {
        await interaction.update({ content: 'La información de la venta no es válida.', components: [], embeds: [] });
        return;
      }

      try {
        const summary = await prisma.$transaction(async (tx) => {
          const inventory = await tx.userItem.findUnique({
            where: { userId_itemId: { userId: targetUserId, itemId } },
            include: { item: true }
          });
          if (!inventory || !inventory.item) {
            throw new Error('NO_ITEM');
          }
          if ((inventory.item.price ?? 0) <= 0) {
            throw new Error('NOT_SELLABLE');
          }
          if (inventory.quantity < quantity) {
            throw new Error('NOT_ENOUGH');
          }

          const unitPrice = inventory.item.price;
          const total = unitPrice * quantity;
          const remaining = inventory.quantity - quantity;

          if (remaining <= 0) {
            await tx.userItem.delete({ where: { userId_itemId: { userId: targetUserId, itemId } } });
          } else {
            await tx.userItem.update({
              where: { userId_itemId: { userId: targetUserId, itemId } },
              data: { quantity: { decrement: quantity } }
            });
          }

          await tx.user.update({
            where: { id: targetUserId },
            data: { vcoins: { increment: total } }
          });

          return {
            itemName: inventory.item.name,
            unitPrice,
            total,
            remaining
          };
        });

        const resultEmbed = new EmbedBuilder()
          .setColor(0x43b581)
          .setTitle('Venta completada')
          .setDescription(`Vendiste ${quantity} × ${summary.itemName}.`)
          .addFields(
            { name: 'Total recibido', value: `${formatNumber(summary.total)} V Coins`, inline: true },
            { name: 'Restante en inventario', value: formatNumber(Math.max(0, summary.remaining)), inline: true }
          );

        await interaction.update({ embeds: [resultEmbed], components: [] });
      } catch (error: any) {
        if (error?.message === 'NO_ITEM' || error?.message === 'NOT_ENOUGH') {
          await interaction.update({ content: 'Ya no tienes suficientes unidades para completar la venta.', components: [], embeds: [] });
          return;
        }
        if (error?.message === 'NOT_SELLABLE') {
          await interaction.update({ content: 'Ese ítem ya no es vendible.', components: [], embeds: [] });
          return;
        }
        console.error('[sell] Error al confirmar la venta', error);
        await interaction.update({ content: 'No se pudo completar la venta. Inténtalo más tarde.', components: [], embeds: [] });
      }
    }
  }
};
