import { StringSelectMenuInteraction } from 'discord.js';
import {
  buildHelpComponents,
  buildHelpEmbed,
  ensureSessionOwner,
  getHelpSessionSafe,
  updateSession,
  refreshHelpCategories, // ⬅️ NUEVO
} from '../../services/helpHub.js';

export async function handleHelpCategorySelect(interaction: StringSelectMenuInteraction) {
  if (interaction.customId !== 'help:cat') return;

  // Refresca catálogo dinámico antes de usarlo
  await refreshHelpCategories(interaction.client);

  const state = getHelpSessionSafe(interaction);
  const ownership = ensureSessionOwner(state, interaction.user.id);
  if (!ownership.ok) {
    await interaction.reply(ownership.reply);
    return;
  }

  const selected = interaction.values[0];
  const updated = updateSession(state!, {
    category: selected,
    page: 0,
    mode: 'category',
    query: undefined,
    results: undefined,
  });

  await interaction.update({
    embeds: [buildHelpEmbed(updated)],
    components: buildHelpComponents(updated),
  });
}