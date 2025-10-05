import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from 'discord.js';
import { prisma } from '../../lib/db.js';
import {
  AttributeKey,
  BASE_ATTRIBUTES,
  buildAttributeSummary,
} from '../../services/progression.js';

const ATTRIBUTE_LABELS: Record<AttributeKey, { name: string; description: string }> = {
  strength: { name: 'Fuerza', description: 'Aumenta el daño base y la capacidad de llevar armaduras pesadas.' },
  agility: { name: 'Agilidad', description: 'Mejora la evasión y los críticos rápidos.' },
  intellect: { name: 'Intelecto', description: 'Potencia habilidades mágicas y escudos.' },
  luck: { name: 'Suerte', description: 'Incrementa probabilidad de críticos y botín.' },
};

const RESPEC_COST = 750;

function formatAttributes(user: any) {
  return Object.entries(ATTRIBUTE_LABELS)
    .map(([key, meta]) => `**${meta.name}:** ${user[key as AttributeKey]} · ${meta.description}`)
    .join('\n');
}

export default {
  data: new SlashCommandBuilder()
    .setName('skills')
    .setDescription('Consulta y asigna puntos de habilidad.')
    .addSubcommand((sub) =>
      sub.setName('ver').setDescription('Muestra tus atributos y puntos disponibles.'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('asignar')
        .setDescription('Asigna puntos a un atributo.')
        .addStringOption((opt) =>
          opt
            .setName('atributo')
            .setDescription('Atributo a mejorar.')
            .setRequired(true)
            .addChoices(
              { name: 'Fuerza', value: 'strength' },
              { name: 'Agilidad', value: 'agility' },
              { name: 'Intelecto', value: 'intellect' },
              { name: 'Suerte', value: 'luck' },
            ),
        )
        .addIntegerOption((opt) =>
          opt
            .setName('puntos')
            .setDescription('Cantidad de puntos a asignar.')
            .setRequired(true)
            .setMinValue(1),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('respec')
        .setDescription('Reinicia tus atributos a cambio de V Coins.'),
    ),
  ns: 'skills',
  async execute(interaction: ChatInputCommandInteraction) {
    const uid = interaction.user.id;
    const sub = interaction.options.getSubcommand();

    const user = await prisma.user.findUnique({ where: { id: uid } });
    if (!user) {
      return interaction.reply({ content: 'Debes usar `/start` primero.', ephemeral: true });
    }

    if (sub === 'ver') {
      const embed = new EmbedBuilder()
        .setTitle('Atributos y habilidades')
        .setDescription(buildAttributeSummary(user))
        .addFields(
          { name: 'Puntos disponibles', value: `${user.skillPoints}`, inline: true },
          { name: 'Sinergias', value: formatAttributes(user), inline: false },
        )
        .setColor(0x1abc9c);
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (sub === 'asignar') {
      const attribute = interaction.options.getString('atributo', true) as AttributeKey;
      const points = interaction.options.getInteger('puntos', true);
      if (user.skillPoints < points) {
        return interaction.reply({ content: 'No tienes suficientes puntos de habilidad.', ephemeral: true });
      }

      const stats = user as any;
      const currentValue = Number(stats[attribute] ?? 0);
      const newValue = currentValue + points;
      await prisma.user.update({
        where: { id: uid },
        data: {
          [attribute]: newValue,
          skillPoints: { decrement: points },
        },
      });

      return interaction.reply({
        content: `Asignaste ${points} punto(s) a **${ATTRIBUTE_LABELS[attribute].name}**.`,
        ephemeral: true,
      });
    }

    if (sub === 'respec') {
      if (user.vcoins < RESPEC_COST) {
        return interaction.reply({ content: `Necesitas ${RESPEC_COST} V Coins para hacer respec.`, ephemeral: true });
      }

      let refunded = user.skillPoints;
      const stats = user as any;
      for (const [key, base] of Object.entries(BASE_ATTRIBUTES)) {
        const attrKey = key as AttributeKey;
        const currentValue = Number(stats[attrKey] ?? base);
        refunded += Math.max(0, currentValue - base);
      }

      await prisma.user.update({
        where: { id: uid },
        data: {
          vcoins: { decrement: RESPEC_COST },
          strength: BASE_ATTRIBUTES.strength,
          agility: BASE_ATTRIBUTES.agility,
          intellect: BASE_ATTRIBUTES.intellect,
          luck: BASE_ATTRIBUTES.luck,
          skillPoints: refunded,
        },
      });

      return interaction.reply({
        content: `Reseteaste tus atributos. Puntos disponibles: ${refunded}. (-${RESPEC_COST} V Coins)`,
        ephemeral: true,
      });
    }
  },
};
