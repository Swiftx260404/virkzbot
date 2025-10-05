import { ModalSubmitInteraction } from 'discord.js';
import {
  buildHelpComponents,
  buildHelpEmbed,
  computeSearchResults,
  ensureSessionOwner,
  getHelpSessionSafe,
  updateSession
} from '../../services/helpHub.js';

export async function handleHelpSearchModal(interaction: ModalSubmitInteraction) {
  if (interaction.customId !== 'help:search-modal') return;

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
    results
  });

  const embed = buildHelpEmbed(updated);
  const components = buildHelpComponents(updated);

  await interaction.deferReply({ ephemeral: true });
  if (interaction.message) {
    await interaction.message.edit({ embeds: [embed], components });
    await interaction.deleteReply();
  } else {
    await interaction.editReply({ embeds: [embed], components });
  }
}
