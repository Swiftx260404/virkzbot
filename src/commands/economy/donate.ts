import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AutocompleteInteraction
} from 'discord.js';
import { GuildBankTxType } from '@prisma/client';
import { prisma } from '../../lib/db.js';
import { getGuildContextForUser } from '../../services/guilds.js';

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
      name: `${row.item?.name ?? 'Ítem'} (${row.quantity})`,
      value: row.item?.key ?? String(row.itemId)
    }));
  await interaction.respond(options);
}

export default {
  data: new SlashCommandBuilder()
    .setName('donate')
    .setDescription('Dona V Coins o ítems al banco de tu gremio.')
    .addIntegerOption((opt) =>
      opt
        .setName('coins')
        .setDescription('Cantidad de V Coins a donar')
        .setMinValue(1)
    )
    .addStringOption((opt) =>
      opt
        .setName('item')
        .setDescription('Nombre o clave del ítem a donar')
        .setAutocomplete(true)
    )
    .addIntegerOption((opt) =>
      opt
        .setName('cantidad')
        .setDescription('Cantidad del ítem a donar (por defecto 1)')
        .setMinValue(1)
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    const ctx = await getGuildContextForUser(interaction.user.id);
    if (!ctx) {
      await interaction.reply({ content: 'Necesitas pertenecer a un gremio para donar.', ephemeral: true });
      return;
    }

    const coinAmount = interaction.options.getInteger('coins');
    const itemInput = interaction.options.getString('item');
    const itemQty = interaction.options.getInteger('cantidad') ?? 1;

    if (!coinAmount && !itemInput) {
      await interaction.reply({ content: 'Indica si donarás V Coins o un ítem.', ephemeral: true });
      return;
    }

    if (coinAmount && itemInput) {
      await interaction.reply({ content: 'Solo puedes donar una cosa a la vez.', ephemeral: true });
      return;
    }

    if (coinAmount) {
      if (coinAmount <= 0) {
        await interaction.reply({ content: 'La donación debe ser positiva.', ephemeral: true });
        return;
      }

      try {
        await prisma.$transaction(async (tx) => {
          const user = await tx.user.findUnique({ where: { id: interaction.user.id } });
          if (!user || user.vcoins < coinAmount) throw new Error('NO_COINS');
          await tx.user.update({ where: { id: interaction.user.id }, data: { vcoins: { decrement: coinAmount } } });
          await tx.guild.update({ where: { id: ctx.guild.id }, data: { bankCoins: { increment: coinAmount } } });
          await tx.guildBankTx.create({
            data: {
              guildId: ctx.guild.id,
              userId: interaction.user.id,
              type: GuildBankTxType.COINS,
              amount: coinAmount
            }
          });
        });
      } catch (error: any) {
        if (error?.message === 'NO_COINS') {
          await interaction.reply({ content: 'No tienes suficientes V Coins.', ephemeral: true });
          return;
        }
        throw error;
      }

      await interaction.reply({ content: `💰 Donaste ${coinAmount} V Coins al banco del gremio.`, ephemeral: true });
      return;
    }

    if (!itemInput) {
      await interaction.reply({ content: 'Especifica el ítem a donar.', ephemeral: true });
      return;
    }

    if (itemQty <= 0) {
      await interaction.reply({ content: 'La cantidad debe ser positiva.', ephemeral: true });
      return;
    }

    const item = await prisma.item.findFirst({
      where: {
        OR: [
          { key: { equals: itemInput, mode: 'insensitive' } },
          { name: { equals: itemInput, mode: 'insensitive' } }
        ]
      }
    });
    if (!item) {
      await interaction.reply({ content: 'No encontré ese ítem.', ephemeral: true });
      return;
    }

    try {
      await prisma.$transaction(async (tx) => {
        const inventory = await tx.userItem.findUnique({
          where: { userId_itemId: { userId: interaction.user.id, itemId: item.id } }
        });
        if (!inventory || inventory.quantity < itemQty) throw new Error('NO_ITEM');
        if (inventory.quantity === itemQty) {
          await tx.userItem.delete({ where: { userId_itemId: { userId: interaction.user.id, itemId: item.id } } });
        } else {
          await tx.userItem.update({
            where: { userId_itemId: { userId: interaction.user.id, itemId: item.id } },
            data: { quantity: { decrement: itemQty } }
          });
        }
        await tx.guildBankItem.upsert({
          where: { guildId_itemId: { guildId: ctx.guild.id, itemId: item.id } },
          update: { quantity: { increment: itemQty } },
          create: { guildId: ctx.guild.id, itemId: item.id, quantity: itemQty }
        });
        await tx.guildBankTx.create({
          data: {
            guildId: ctx.guild.id,
            userId: interaction.user.id,
            type: GuildBankTxType.ITEM,
            itemId: item.id,
            quantity: itemQty
          }
        });
      });
    } catch (error: any) {
      if (error?.message === 'NO_ITEM') {
        await interaction.reply({ content: 'No tienes suficientes unidades de ese ítem.', ephemeral: true });
        return;
      }
      throw error;
    }

    await interaction.reply({ content: `📦 Donaste ${itemQty} × ${item.name}.`, ephemeral: true });
  },
  async autocomplete(interaction: AutocompleteInteraction) {
    await autocompleteInventory(interaction);
  }
};
