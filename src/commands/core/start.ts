import { SlashCommandBuilder, ChatInputCommandInteraction, ButtonBuilder, ButtonStyle, ActionRowBuilder, EmbedBuilder } from 'discord.js';
import { prisma } from '../../lib/db.js';

export default {
  data: new SlashCommandBuilder()
    .setName('start')
    .setDescription('Crear tu perfil y empezar a jugar (solo una vez).'),
  ns: 'start',
  async execute(interaction: ChatInputCommandInteraction) {
    const uid = interaction.user.id;
    const user = await prisma.user.upsert({
      where: { id: uid },
      update: {},
      create: { id: uid }, // 100 V Coins por default
    });
    const embed = new EmbedBuilder()
      .setTitle('¡Bienvenido a **Virkz**!')
      .setDescription('Tu perfil ha sido creado. Comienza con **100 V Coins**. Compra una herramienta en `/shop` y usa `/buy` para empezar a minar o pescar.')
      .setColor(0x00e6a8);
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('start:quick').setLabel('Guía rápida').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('start:shop').setLabel('Ir a la Tienda').setStyle(ButtonStyle.Secondary),
    );
    await interaction.reply({ embeds: [embed], components: [row] });
  },
  async handleInteraction(interaction: any) {
    if (!interaction.isButton()) return;
    if (interaction.customId === 'start:shop') {
      await interaction.update({ content: 'Abre `/shop` para ver categorías disponibles.', components: [], embeds: [] });
      return;
    }
    if (interaction.customId === 'start:quick') {
      await interaction.update({ content: '1) Compra un **Pico** o una **Caña** con `/shop` + `/buy`. 2) Usa `/mine` o `/fish`. 3) Revisa tu `/inventory` y `/profile`.4) Pista: Herramientas de mayor **tier** desbloquean nuevas zonas.', components: [], embeds: [] });
      return;
    }
  }
};
