import { ButtonInteraction } from 'discord.js';
import {
  buildHelpComponents,
  buildHelpEmbed,
  createSearchModal,
  ensureSessionOwner,
  getHelpSessionSafe,
  getTotalPages,
  resetToCategory,
  updateSession
} from '../../services/helpHub.js';

export async function handleHelpButton(interaction: ButtonInteraction) {
  if (!interaction.customId.startsWith('help:')) return;

  const state = getHelpSessionSafe(interaction);
  const ownership = ensureSessionOwner(state, interaction.user.id);
  if (!ownership.ok) {
    await interaction.reply(ownership.reply);
    return;
  }

  const [, action, subaction] = interaction.customId.split(':');

  if (action === 'search') {
    const modal = createSearchModal();
    await interaction.showModal(modal);
    return;
  }

  if (action === 'reset') {
    const updated = resetToCategory(state!);
    await interaction.update({
      embeds: [buildHelpEmbed(updated)],
      components: buildHelpComponents(updated)
    });
    return;
  }

  if (action === 'page') {
    const direction = subaction === 'prev' ? -1 : 1;
    const totalPages = getTotalPages(state!);
    const nextPage = Math.min(Math.max(0, state!.page + direction), Math.max(0, totalPages - 1));
    const updated = updateSession(state!, { page: nextPage });
    await interaction.update({
      embeds: [buildHelpEmbed(updated)],
      components: buildHelpComponents(updated)
    });
    return;
  }
}
