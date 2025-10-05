import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { prisma } from '../../lib/db.js';

export default {
  data: new SlashCommandBuilder()
    .setName('daily')
    .setDescription('Reclama tu recompensa diaria.'),
  async execute(interaction: ChatInputCommandInteraction) {
    const uid = interaction.user.id;
    const u = await prisma.user.findUnique({ where: { id: uid } });
    if (!u) return interaction.reply({ content: 'Usa `/start` primero.', ephemeral: true });
    const now = new Date();
    if (u.lastDailyAt && now.getTime() - new Date(u.lastDailyAt).getTime() < 24*60*60*1000) {
      const remaining = 24*60*60*1000 - (now.getTime() - new Date(u.lastDailyAt).getTime());
      const hrs = Math.ceil(remaining/3600000);
      return interaction.reply({ content: `⏳ Aún faltan ~${hrs}h para tu próximo daily.`, ephemeral: true });
    }
    const reward = 50 + Math.floor(Math.random()*30);
    await prisma.user.update({ where: { id: uid }, data: { vcoins: { increment: reward }, lastDailyAt: now } });
    await interaction.reply({ content: `🎁 Has recibido **${reward} V Coins**.` });
  }
}
