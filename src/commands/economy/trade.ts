import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ModalBuilder,
  ModalSubmitInteraction,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle
} from 'discord.js';
import { prisma } from '../../lib/db.js';
import {
  TradeItemOffer,
  TradeSession,
  bindSessionMessage,
  clearTradeSession,
  createTradeSession,
  getOtherParticipant,
  getSessionParticipants,
  getTradeSessionByMessage,
  getTradeSessionForUser,
  isSessionExpired,
  setConfirmation,
  setTradeOffer,
  touchTradeSession
} from '../../services/tradeSessions.js';
import { useScopedCooldown } from '../../services/cooldowns.js';

const OFFER_MODAL_PREFIX = 'trade:offer:';
const OFFER_INPUT_ID = 'trade:items';
const TRADE_COOLDOWN_MS = 15_000;

function formatOfferList(items: TradeItemOffer[]) {
  if (!items.length) return '— Sin oferta —';
  return items.map((item) => `• ${item.quantity} × ${item.name}`).join('\n');
}

function buildTradeEmbed(session: TradeSession) {
  const embed = new EmbedBuilder()
    .setColor(0x00b0f4)
    .setTitle('Intercambio en progreso')
    .setDescription('Usa **Editar mi oferta** para añadir ítems (formato: `nombre cantidad`).')
    .setFooter({ text: 'Expira automáticamente tras 2 minutos sin actividad.' });

  for (const userId of getSessionParticipants(session)) {
    const offer = session.offers[userId];
    const status = offer.confirmed ? '✅ Confirmado' : '⌛ Pendiente';
    embed.addFields({
      name: `${status} · Oferta de <@${userId}>`,
      value: formatOfferList(offer.items),
      inline: false
    });
  }

  return embed;
}

function buildTradeComponents(session: TradeSession) {
  const disabled = isSessionExpired(session);
  const editButton = new ButtonBuilder()
    .setCustomId(`trade:edit:${session.id}`)
    .setLabel('Editar mi oferta')
    .setStyle(ButtonStyle.Primary)
    .setDisabled(disabled);

  const confirmButton = new ButtonBuilder()
    .setCustomId(`trade:confirm:${session.id}`)
    .setLabel('Confirmar intercambio')
    .setStyle(ButtonStyle.Success)
    .setDisabled(disabled);

  const cancelButton = new ButtonBuilder()
    .setCustomId(`trade:cancel:${session.id}`)
    .setLabel('Cancelar')
    .setStyle(ButtonStyle.Danger)
    .setDisabled(disabled);

  return [new ActionRowBuilder<ButtonBuilder>().addComponents(editButton, confirmButton, cancelButton)];
}

function buildOfferModal(session: TradeSession, userId: string) {
  const modal = new ModalBuilder()
    .setCustomId(`${OFFER_MODAL_PREFIX}${session.id}`)
    .setTitle('Editar oferta de intercambio');

  const current = session.offers[userId]?.items ?? [];
  const value = current.map((item) => `${item.name} ${item.quantity}`).join('\n');

  const input = new TextInputBuilder()
    .setCustomId(OFFER_INPUT_ID)
    .setLabel('Ítems (uno por línea: nombre cantidad)')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('Ejemplo:\nHierro 3\nPico Básico 1')
    .setRequired(false);

  if (value) {
    input.setValue(value);
  }

  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
  return modal;
}

async function ensureUsersExist(...userIds: string[]) {
  const users = await prisma.user.findMany({ where: { id: { in: userIds } } });
  const set = new Set(users.map((u) => u.id));
  return userIds.filter((id) => !set.has(id));
}

async function parseOfferInput(userId: string, raw: string) {
  const inventory = await prisma.userItem.findMany({
    where: { userId, quantity: { gt: 0 } },
    include: { item: true }
  });

  const lines = raw
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) {
    return [] as TradeItemOffer[];
  }

  const aggregated = new Map<number, TradeItemOffer & { available: number }>();

  for (const line of lines) {
    const match = line.match(/^(.+?)\s+(\d+)$/);
    if (!match) {
      throw new Error(`Formato inválido en "${line}". Usa "nombre cantidad".`);
    }
    const identifier = match[1].trim().toLowerCase();
    const quantity = Number(match[2]);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new Error(`Cantidad inválida en "${line}".`);
    }

    const entry = inventory.find((inv) => {
      const name = inv.item?.name?.toLowerCase() ?? '';
      const key = inv.item?.key?.toLowerCase() ?? '';
      return name === identifier || key === identifier;
    });

    if (!entry || !entry.item) {
      throw new Error(`No encontré "${match[1].trim()}" en tu inventario.`);
    }

    const existing = aggregated.get(entry.item.id) ?? {
      itemId: entry.item.id,
      name: entry.item.name,
      quantity: 0,
      available: entry.quantity
    };

    existing.quantity += quantity;
    if (existing.quantity > existing.available) {
      throw new Error(`Superas tus existencias de ${entry.item.name} (máx ${existing.available}).`);
    }

    aggregated.set(entry.item.id, existing);
  }

  return Array.from(aggregated.values()).map(({ available, ...offer }) => offer);
}

function buildTradeSummaryEmbed(session: TradeSession) {
  const [a, b] = getSessionParticipants(session);
  const embed = new EmbedBuilder()
    .setColor(0x43b581)
    .setTitle('Intercambio completado')
    .setDescription(`✅ <@${a}> y <@${b}> intercambiaron sus ítems.`);

  const offersA = session.offers[a]?.items ?? [];
  const offersB = session.offers[b]?.items ?? [];

  embed.addFields(
    { name: `<@${a}> recibe`, value: formatOfferList(offersB), inline: false },
    { name: `<@${b}> recibe`, value: formatOfferList(offersA), inline: false }
  );

  return embed;
}

export default {
  data: new SlashCommandBuilder()
    .setName('trade')
    .setDescription('Inicia un intercambio seguro con otro jugador.')
    .addUserOption((option) =>
      option
        .setName('usuario')
        .setDescription('Usuario con quien quieres intercambiar')
        .setRequired(true)
    ),
  ns: 'trade',
  async execute(interaction: ChatInputCommandInteraction) {
    const targetUser = interaction.options.getUser('usuario', true);
    const initiatorId = interaction.user.id;
    if (targetUser.id === initiatorId) {
      await interaction.reply({ content: 'No puedes comerciar contigo mismo.', ephemeral: true });
      return;
    }

    const cooldown = useScopedCooldown('trade:init', initiatorId, TRADE_COOLDOWN_MS);
    if (!cooldown.ok) {
      await interaction.reply({ content: `⏳ Espera ${(cooldown.remaining/1000).toFixed(1)}s antes de iniciar otro intercambio.`, ephemeral: true });
      return;
    }

    const existing = getTradeSessionForUser(initiatorId) ?? getTradeSessionForUser(targetUser.id);
    if (existing) {
      await interaction.reply({ content: 'Ya hay un intercambio activo para alguno de ustedes.', ephemeral: true });
      return;
    }

    const missing = await ensureUsersExist(initiatorId, targetUser.id);
    if (missing.length) {
      await interaction.reply({ content: 'Ambos deben haber usado `/start` antes de intercambiar.', ephemeral: true });
      return;
    }

    const session = createTradeSession({
      initiatorId,
      targetId: targetUser.id,
      channelId: interaction.channelId ?? '',
      guildId: interaction.guildId ?? undefined
    });

    const embed = buildTradeEmbed(session);
    const components = buildTradeComponents(session);

    await interaction.reply({
      content: `🤝 Intercambio creado entre <@${initiatorId}> y <@${targetUser.id}>. Ambos deben confirmar para completarlo.`,
      embeds: [embed],
      components,
      allowedMentions: { users: [initiatorId, targetUser.id] }
    });

    const message = await interaction.fetchReply();
    bindSessionMessage(session.id, message.id);
    touchTradeSession(session.id);
  },
  async handleInteraction(interaction: any) {
    if (interaction.isButton() && interaction.customId.startsWith('trade:')) {
      await handleTradeButton(interaction);
      return;
    }
    if (interaction.isModalSubmit() && interaction.customId.startsWith(OFFER_MODAL_PREFIX)) {
      await handleTradeModal(interaction);
    }
  }
};

async function handleTradeButton(interaction: ButtonInteraction) {
  const [ , action, sessionId ] = interaction.customId.split(':');
  const session = getTradeSessionByMessage(interaction.message.id);
  if (!session) {
    await interaction.update({ content: '⚠️ Este intercambio ya no está disponible.', embeds: [], components: [] });
    return;
  }

  if (isSessionExpired(session)) {
    clearTradeSession(session.id);
    await interaction.update({ content: '⏱️ Intercambio expirado por inactividad.', embeds: [], components: [] });
    return;
  }

  if (session.id !== sessionId) {
    await interaction.reply({ content: 'Sesión inválida o desincronizada.', ephemeral: true });
    return;
  }

  const participants = getSessionParticipants(session);
  if (!participants.includes(interaction.user.id)) {
    await interaction.reply({ content: 'Solo los participantes pueden usar estos controles.', ephemeral: true });
    return;
  }

  touchTradeSession(session.id);

  if (action === 'edit') {
    const modal = buildOfferModal(session, interaction.user.id);
    await interaction.showModal(modal);
    return;
  }

  if (action === 'cancel') {
    clearTradeSession(session.id);
    await interaction.update({
      content: `❌ Intercambio cancelado por <@${interaction.user.id}>.`,
      embeds: [],
      components: []
    });
    return;
  }

  if (action === 'confirm') {
    const updated = setConfirmation(session.id, interaction.user.id, true);
    if (!updated) {
      await interaction.reply({ content: 'No se pudo actualizar la confirmación.', ephemeral: true });
      return;
    }

    const stillActive = getSessionParticipants(updated).every((userId) => updated.offers[userId]?.confirmed);
    if (!stillActive) {
      await interaction.update({ embeds: [buildTradeEmbed(updated)], components: buildTradeComponents(updated) });
      return;
    }

    try {
      await finalizeTrade(interaction, updated);
    } catch (error) {
      console.error('[trade] Error finalizando intercambio', error);
      clearTradeSession(updated.id);
      await interaction.update({ content: '❌ No se pudo completar el intercambio. Revisa inventarios e inténtalo nuevamente.', embeds: [], components: [] });
    }
  }
}

async function handleTradeModal(interaction: ModalSubmitInteraction) {
  const sessionId = interaction.customId.replace(OFFER_MODAL_PREFIX, '');
  const session = getTradeSessionByMessage(interaction.message?.id ?? '');
  if (!session || session.id !== sessionId) {
    await interaction.reply({ content: 'El intercambio ya no está activo.', ephemeral: true });
    return;
  }

  if (isSessionExpired(session)) {
    clearTradeSession(session.id);
    if (interaction.message) {
      await interaction.deferReply({ ephemeral: true });
      await interaction.message.edit({ content: '⏱️ Intercambio expirado por inactividad.', embeds: [], components: [] });
      await interaction.editReply({ content: '⏱️ Intercambio expirado por inactividad.' });
    } else {
      await interaction.reply({ content: '⏱️ Intercambio expirado por inactividad.', ephemeral: true });
    }
    return;
  }

  if (!getSessionParticipants(session).includes(interaction.user.id)) {
    await interaction.reply({ content: 'Solo los participantes pueden modificar la oferta.', ephemeral: true });
    return;
  }

  const raw = interaction.fields.getTextInputValue(OFFER_INPUT_ID) ?? '';

  try {
    const offers = await parseOfferInput(interaction.user.id, raw);
    const updated = setTradeOffer(session.id, interaction.user.id, offers);
    if (!updated) throw new Error('SESSION_MISSING');
    if (interaction.message) {
      await interaction.deferReply({ ephemeral: true });
      await interaction.message.edit({ embeds: [buildTradeEmbed(updated)], components: buildTradeComponents(updated) });
      await interaction.deleteReply();
    } else {
      await interaction.reply({ embeds: [buildTradeEmbed(updated)], components: buildTradeComponents(updated), ephemeral: true });
    }
  } catch (error: any) {
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content: `❌ ${error.message ?? 'No se pudo guardar tu oferta.'}`, ephemeral: true });
    } else {
      await interaction.reply({ content: `❌ ${error.message ?? 'No se pudo guardar tu oferta.'}`, ephemeral: true });
    }
  }
}

async function finalizeTrade(interaction: ButtonInteraction, session: TradeSession) {
  const participants = getSessionParticipants(session);

  await prisma.$transaction(async (tx) => {
    for (const userId of participants) {
      const offer = session.offers[userId]?.items ?? [];
      for (const item of offer) {
        const inventory = await tx.userItem.findUnique({
          where: { userId_itemId: { userId, itemId: item.itemId } }
        });
        if (!inventory || inventory.quantity < item.quantity) {
          throw new Error(`Inventario insuficiente para ${item.name}.`);
        }
      }
    }

    for (const userId of participants) {
      const offer = session.offers[userId]?.items ?? [];
      for (const item of offer) {
        const remaining = await tx.userItem.update({
          where: { userId_itemId: { userId, itemId: item.itemId } },
          data: { quantity: { decrement: item.quantity } }
        });
        if (remaining.quantity <= 0) {
          await tx.userItem.delete({ where: { userId_itemId: { userId, itemId: item.itemId } } });
        }
      }
    }

    for (const userId of participants) {
      const receiver = getOtherParticipant(session, userId);
      if (!receiver) continue;
      const offer = session.offers[userId]?.items ?? [];
      for (const item of offer) {
        await tx.userItem.upsert({
          where: { userId_itemId: { userId: receiver, itemId: item.itemId } },
          update: { quantity: { increment: item.quantity } },
          create: { userId: receiver, itemId: item.itemId, quantity: item.quantity }
        });
      }
    }
  });

  const embed = buildTradeSummaryEmbed(session);
  clearTradeSession(session.id);
  await interaction.update({ content: '✅ Intercambio finalizado con éxito.', embeds: [embed], components: [] });
}
