import { ModalSubmitInteraction } from 'discord.js';
import {
  buildHelpComponents,
  buildHelpEmbed,
  computeSearchResults,
  ensureSessionOwner,
  getHelpSessionSafe,
  updateSession,
  refreshHelpCategories, // ⬅️ NUEVO
} from '../../services/helpHub.js';

export async function handleHelpSearchModal(interaction: ModalSubmitInteraction) {
  if (interaction.customId !== 'help:search-modal') return;

  // Actualiza catálogo antes de buscar
  await refreshHelpCategories(interaction.client);

  const state = getHelpSessionSafe(interaction);
  const ownership = ensureSessionOwner(state, interaction.user.id);
  if (!ownership.ok) {
    await interaction.reply(ownership.reply);
    return;
  }

  const rawQuery = interaction.fields.getTextInputValue('help:search-query');
  const { results } = computeSearchResults(rawQuery);

  const updated = updateSession(state!, {
    mode: 'search',
    query: rawQuery,
    page: 0,
    results,
  });

  const embed = buildHelpEmbed(updated);
  const components = buildHelpComponents(updated);

  // Mantén la UX actual: actualizas el mismo mensaje y usas ephemeral solo como tránsito
  await interaction.deferReply({ ephemeral: true });
  if (interaction.message) {
    await (interaction.message as any).edit({ embeds: [embed], components });
    await interaction.deleteReply();
  } else {
    await interaction.editReply({ embeds: [embed], components });
  }
}