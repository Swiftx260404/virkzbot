import { SlashCommandBuilder, ChatInputCommandInteraction, StringSelectMenuBuilder, ActionRowBuilder, EmbedBuilder } from 'discord.js';

const categories = {
  'Economía': ['daily','work','shop','buy','inventory'],
  'RPG': ['mine','fish','equip','profile'],
  'Info': ['start','help','profile']
};

export default {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Ayuda interactiva por categorías.'),
  ns: 'help',
  async execute(interaction: ChatInputCommandInteraction) {
    const options = Object.keys(categories).map((c, i) => ({ label: c, value: `cat_${i}` }));
    const select = new StringSelectMenuBuilder()
      .setCustomId('help:cat')
      .setPlaceholder('Elige una categoría')
      .addOptions(options);
    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
    const embed = new EmbedBuilder().setTitle('Ayuda de Virkz').setDescription('Selecciona una categoría para ver comandos.');
    await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
  },
  async handleInteraction(interaction: any) {
    if (!interaction.isStringSelectMenu() || interaction.customId !== 'help:cat') return;
    const val = interaction.values[0];
    const idx = Number(val.split('_')[1]);
    const key = Object.keys(categories)[idx];
    const cmds = categories[key as keyof typeof categories];
    await interaction.update({ content: `**${key}**\n• ` + cmds.map(c => `\`/${c}\``).join(' • '), components: [] });
  }
}
