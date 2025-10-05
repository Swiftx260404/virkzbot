import {
  ChatInputCommandInteraction,
  SlashCommandBuilder
} from 'discord.js';
import {
  HELP_CATEGORIES,
  HelpSessionState,
  buildHelpComponents,
  buildHelpEmbed,
  setHelpSession,
  refreshHelpCategories, // 🔁
} from '../../services/helpHub.js';
import { handleHelpButton } from '../../interactions/buttons/help.js';
import { handleHelpCategorySelect } from '../../interactions/select-menus/help.js';
import { handleHelpSearchModal } from '../../interactions/modals/help.js';

export default {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Abre el HUB interactivo de ayuda.'),
  ns: 'help',
  async execute(interaction: ChatInputCommandInteraction) {
    await refreshHelpCategories(interaction.client); // 🔁 reconstruye dinámicamente

    const firstCategory = HELP_CATEGORIES[0]?.key ?? 'core';
    const baseState: Omit<HelpSessionState, 'messageId' | 'ephemeral'> = {
      userId: interaction.user.id,
      category: firstCategory,
      page: 0,
      mode: 'category',
      query: undefined,
      results: undefined,
      createdAt: Date.now()
    };

    const payload = {
      embeds: [buildHelpEmbed({ ...baseState, messageId: 'pending', ephemeral: false })],
      components: buildHelpComponents({ ...baseState, messageId: 'pending', ephemeral: false })
    };

    let ephemeral = false;
    try {
      await interaction.reply(payload);
    } catch {
      ephemeral = true;
      await interaction.reply({ ...payload, ephemeral: true });
    }

    const message = await interaction.fetchReply();
    const state: HelpSessionState = {
      ...baseState,
      messageId: message.id,
      ephemeral,
      createdAt: Date.now()
    };
    setHelpSession(state);

    await interaction.editReply({
      embeds: [buildHelpEmbed(state)],
      components: buildHelpComponents(state)
    });
  },
  async handleInteraction(interaction: any) {
    // 🔁 refresca también en las interacciones del hub
    await refreshHelpCategories(interaction.client);

    if (interaction.isStringSelectMenu()) return handleHelpCategorySelect(interaction);
    if (interaction.isButton())           return handleHelpButton(interaction);
    if (interaction.isModalSubmit())      return handleHelpSearchModal(interaction);
  }
};