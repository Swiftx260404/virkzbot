import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { prisma } from '../../lib/db.js';

export default {
  data: new SlashCommandBuilder()
    .setName('profile')
    .setDescription('Muestra tu perfil global.'),
  async execute(interaction: ChatInputCommandInteraction) {
    const uid = interaction.user.id;
    const u = await prisma.user.findUnique({ where: { id: uid } });
    if (!u) {
      await interaction.reply({ content: 'Primero usa `/start` para crear tu perfil.', ephemeral: true });
      return;
    }

    const pick = u.equippedPickaxeId ? await prisma.item.findUnique({ where: { id: u.equippedPickaxeId } }) : null;
    const rod = u.equippedRodId ? await prisma.item.findUnique({ where: { id: u.equippedRodId } }) : null;

    const embed = new EmbedBuilder()
      .setTitle(`Perfil de ${interaction.user.username}`)
      .setColor(0x8e44ad)
      .addFields(
        { name: 'V Coins', value: String(u.vcoins), inline: true },
        { name: 'Nivel', value: String(u.level), inline: true },
        { name: 'XP', value: String(u.xp), inline: true },
        { name: 'Pico equipado', value: pick ? `${pick.name} (T${pick.tier})` : '—', inline: true },
        { name: 'Caña equipada', value: rod ? `${rod.name} (T${rod.tier})` : '—', inline: true },
      );
    await interaction.reply({ embeds: [embed] });
  }
};
