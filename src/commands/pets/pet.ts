import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  AutocompleteInteraction,
  ButtonInteraction,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
} from 'discord.js';
import { prisma } from '../../lib/db.js';
import {
  getActivePetContext,
  petXpToNext,
  summarizePassiveBonus,
  grantPetExperience,
  clampPetGauge,
  parseEvolutionRequirements,
} from '../../services/pets.js';
import type { ActivePetContext } from '../../services/pets.js';

const STARTER_CHOICES = [
  { key: 'ember_pup', name: 'Cachorro Ascua', hint: 'Ataque y críticos en combate.' },
  { key: 'tide_sprite', name: 'Duende de Mareas', hint: 'Suerte y botín acuático.' },
  { key: 'terra_sprout', name: 'Brote de Gaia', hint: 'Defensa y escudos de apoyo.' },
] as const;

const FEED_CHOICES = [
  { key: 'pet_snack_basic', label: 'Snack Crunchy' },
  { key: 'pet_snack_hearty', label: 'Banquete Nutritivo' },
  { key: 'pet_snack_feast', label: 'Festín Místico' },
] as const;

const pendingReleases = new Map<string, { userId: string; petId: number; expires: number }>();

function makeToken() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function scheduleCleanup(token: string) {
  setTimeout(() => pendingReleases.delete(token), 2 * 60 * 1000).unref();
}

function formatGauge(value: number) {
  if (value <= 0) return '✅ Pleno';
  if (value < 35) return `🟢 ${value}%`;
  if (value < 70) return `🟡 ${value}%`;
  return `🔴 ${value}%`;
}

function describePet(pet: ActivePetContext['userPet'] | null, passive?: string[]) {
  if (!pet) return 'Sin mascota activa.';
  const xpGoal = petXpToNext(pet.level);
  const progress = Math.round((pet.xp / Math.max(1, xpGoal)) * 100);
  const hunger = formatGauge(pet.hunger);
  const bond = `${pet.bond}/100`;
  const passiveSummary = passive?.length ? passive.join(' · ') : '—';
  return (
    `Nivel ${pet.level} · ${pet.xp}/${xpGoal} XP (${progress}%)\n` +
    `Hambre: ${hunger} · Afinidad: ${bond}\n` +
    `Bonos: ${passiveSummary}`
  );
}

function parsePetFood(meta: any) {
  if (!meta || typeof meta !== 'object') return null;
  const data = (meta as any).petFood;
  if (!data || typeof data !== 'object') return null;
  const hungerRestore = Number(data.hungerRestore ?? 0);
  const bondGain = Number(data.bondGain ?? 0);
  const xpGain = Number(data.xpGain ?? 0);
  if ([hungerRestore, bondGain, xpGain].every((n) => !Number.isFinite(n))) return null;
  return {
    hungerRestore: Math.max(0, Math.round(hungerRestore)),
    bondGain: Math.max(0, Math.round(bondGain)),
    xpGain: Math.max(0, Math.round(xpGain)),
  };
}

async function fetchUserPets(userId: string) {
  return prisma.userPet.findMany({
    where: { userId },
    include: { pet: true },
    orderBy: [{ active: 'desc' }, { level: 'desc' }, { createdAt: 'asc' }],
    take: 25,
  });
}

export default {
  data: new SlashCommandBuilder()
    .setName('pet')
    .setDescription('Gestiona y entrena tus mascotas.')
    .addSubcommand((sub) =>
      sub
        .setName('adopt')
        .setDescription('Elige tu primera mascota compañera.')
        .addStringOption((opt) => {
          opt.setName('starter').setDescription('Mascota inicial').setRequired(true);
          for (const choice of STARTER_CHOICES) {
            opt.addChoices({ name: `${choice.name} — ${choice.hint}`, value: choice.key });
          }
          return opt;
        }),
    )
    .addSubcommand((sub) => sub.setName('info').setDescription('Consulta los detalles de tu mascota activa.'))
    .addSubcommand((sub) => sub.setName('list').setDescription('Lista todas tus mascotas.'))
    .addSubcommand((sub) => sub.setName('train').setDescription('Entrena a tu mascota activa para ganar XP.'))
    .addSubcommand((sub) =>
      sub
        .setName('feed')
        .setDescription('Alimenta a tu mascota con snacks especiales.')
        .addStringOption((opt) => {
          opt.setName('item').setDescription('Comida para mascota').setRequired(true);
          for (const choice of FEED_CHOICES) {
            opt.addChoices({ name: choice.label, value: choice.key });
          }
          opt.setAutocomplete(true);
          return opt;
        }),
    )
    .addSubcommand((sub) => sub.setName('evolve').setDescription('Evoluciona tu mascota activa si cumple los requisitos.'))
    .addSubcommand((sub) =>
      sub
        .setName('release')
        .setDescription('Libera una de tus mascotas (requiere confirmación).')
        .addStringOption((opt) =>
          opt.setName('pet').setDescription('Mascota a liberar').setRequired(true).setAutocomplete(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('setactive')
        .setDescription('Activa otra mascota de tu colección.')
        .addStringOption((opt) =>
          opt.setName('pet').setDescription('Mascota a activar').setRequired(true).setAutocomplete(true),
        ),
    ),
  ns: 'pet',
  async execute(interaction: ChatInputCommandInteraction) {
    const userId = interaction.user.id;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return interaction.reply({ content: 'Primero usa `/start` para crear tu perfil.', ephemeral: true });
    }

    const sub = interaction.options.getSubcommand();

    if (sub === 'adopt') {
      const count = await prisma.userPet.count({ where: { userId } });
      if (count > 0) {
        return interaction.reply({
          content: 'Ya tienes una mascota registrada. Más adelante se añadirán más formas de conseguir nuevas.',
          ephemeral: true,
        });
      }
      const starterKey = interaction.options.getString('starter', true);
      const pet = await prisma.pet.findUnique({ where: { key: starterKey } });
      if (!pet || pet.formStage > 1) {
        return interaction.reply({ content: 'Esa mascota inicial no está disponible.', ephemeral: true });
      }

      await prisma.userPet.create({
        data: {
          userId,
          petId: pet.id,
          active: true,
        },
      });
      const ctx = await getActivePetContext(userId);
      const summary = ctx
        ? describePet(ctx.userPet, summarizePassiveBonus(ctx.passive))
        : `Nivel 1 · 0/${petXpToNext(1)} XP (0%)\nHambre: ✅ Pleno · Afinidad: 0/100\nBonos: —`;
      const embed = new EmbedBuilder()
        .setColor(0xffa34d)
        .setTitle(`Has adoptado a ${ctx?.userPet.pet.name ?? pet.name}!`)
        .setDescription(summary)
        .setFooter({ text: 'Entrena a tu compañero con /pet train y aliméntalo con /pet feed.' });

      return interaction.reply({ embeds: [embed] });
    }

    if (sub === 'info') {
      const ctx = await getActivePetContext(userId);
      if (!ctx) {
        return interaction.reply({ content: 'No tienes una mascota activa. Usa `/pet adopt` o `/pet setactive`.', ephemeral: true });
      }
      const passive = summarizePassiveBonus(ctx.passive);
      const xpTarget = petXpToNext(ctx.userPet.level);
      const embed = new EmbedBuilder()
        .setColor(0x8e44ad)
        .setTitle(`Mascota activa: ${ctx.userPet.pet.name}`)
        .setDescription(describePet(ctx.userPet, passive))
        .addFields(
          {
            name: 'Estado',
            value:
              `Rareza: ${ctx.userPet.pet.rarity}\n` +
              `Etapa: ${ctx.userPet.pet.formStage}\n` +
              `XP restante: ${Math.max(0, xpTarget - ctx.userPet.xp)}`,
            inline: true,
          },
          {
            name: 'Habilidad activa',
            value: ctx.skill?.name ?? '—',
            inline: true,
          },
        )
        .setFooter({ text: 'Recuerda alimentarla para mantener la afinidad alta.' });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (sub === 'list') {
      const pets = await fetchUserPets(userId);
      if (!pets.length) {
        return interaction.reply({ content: 'Todavía no tienes mascotas registradas.', ephemeral: true });
      }
      const lines = pets.map((entry) => {
        const state = entry.active ? '🟢 Activa' : '⚪ Reserva';
        const xpGoal = petXpToNext(entry.level);
        return `${state} — **${entry.pet.name}** · Nv ${entry.level} (${entry.xp}/${xpGoal} XP) · Afinidad ${entry.bond}/100`;
      });
      const embed = new EmbedBuilder()
        .setColor(0x00a8ff)
        .setTitle('Tus mascotas')
        .setDescription(lines.join('\n'))
        .setFooter({ text: 'Usa /pet setactive para cambiar de acompañante o /pet release para liberarla.' });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (sub === 'train') {
      const ctx = await getActivePetContext(userId);
      if (!ctx) {
        return interaction.reply({ content: 'Necesitas una mascota activa para entrenar.', ephemeral: true });
      }
      if (user.energy < 12) {
        return interaction.reply({ content: 'Necesitas al menos 12 de energía para entrenar.', ephemeral: true });
      }

      const baseXp = 45 + ctx.userPet.level * 6;
      const hungerPenalty = Math.max(0.35, 1 - ctx.userPet.hunger / 120);
      const bondBonus = 1 + ctx.userPet.bond / 140;
      const xpGain = Math.max(8, Math.round(baseXp * hungerPenalty * bondBonus));
      const hungerGain = 18;
      const bondGain = Math.max(1, Math.round(1 + ctx.userPet.bond / 60));

      let result = { xp: ctx.userPet.xp, level: ctx.userPet.level, leveled: false };
      let newHunger = clampPetGauge(ctx.userPet.hunger + hungerGain);
      let newBond = clampPetGauge(ctx.userPet.bond + bondGain);

      await prisma.$transaction(async (tx) => {
        await tx.user.update({ where: { id: userId }, data: { energy: { decrement: 12 } } });
        await tx.userPet.update({
          where: { id: ctx.userPet.id },
          data: { hunger: newHunger, bond: newBond },
        });
        const xpRes = await grantPetExperience(tx, ctx.userPet.id, xpGain);
        if (xpRes) {
          result = xpRes;
        }
      });

      const updated = await getActivePetContext(userId);
      const passive = updated ? summarizePassiveBonus(updated.passive) : [];
      const embed = new EmbedBuilder()
        .setColor(0x2ecc71)
        .setTitle(`Entrenamiento completado (${updated?.userPet.pet.name ?? ctx.userPet.pet.name})`)
        .setDescription(describePet(updated?.userPet ?? ctx.userPet, passive))
        .addFields(
          { name: 'XP ganada', value: `${xpGain}`, inline: true },
          { name: 'Energía usada', value: '12 ⚡', inline: true },
        );
      if (result.leveled) {
        embed.addFields({ name: '¡Subió de nivel!', value: `Ahora es nivel ${result.level}.`, inline: false });
      }
      if (newHunger >= 80) {
        embed.setFooter({ text: 'Tu mascota está exhausta, considera alimentarla antes del próximo entrenamiento.' });
      }
      return interaction.reply({ embeds: [embed] });
    }

    if (sub === 'feed') {
      const ctx = await getActivePetContext(userId);
      if (!ctx) {
        return interaction.reply({ content: 'No tienes una mascota activa que alimentar.', ephemeral: true });
      }
      const key = interaction.options.getString('item', true);
      const item = await prisma.item.findUnique({ where: { key } });
      if (!item) {
        return interaction.reply({ content: 'Ese snack no existe.', ephemeral: true });
      }
      const food = parsePetFood(item.metadata);
      if (!food) {
        return interaction.reply({ content: 'Ese artículo no puede alimentar mascotas.', ephemeral: true });
      }
      const inventory = await prisma.userItem.findUnique({ where: { userId_itemId: { userId, itemId: item.id } } });
      if (!inventory || inventory.quantity <= 0) {
        return interaction.reply({ content: 'No tienes ese snack en tu inventario.', ephemeral: true });
      }

      let leveled = false;
      await prisma.$transaction(async (tx) => {
        if (inventory.quantity <= 1) {
          await tx.userItem.delete({ where: { userId_itemId: { userId, itemId: item.id } } });
        } else {
          await tx.userItem.update({
            where: { userId_itemId: { userId, itemId: item.id } },
            data: { quantity: { decrement: 1 } },
          });
        }
        const hunger = clampPetGauge(ctx.userPet.hunger - food.hungerRestore);
        const bond = clampPetGauge(ctx.userPet.bond + food.bondGain);
        await tx.userPet.update({ where: { id: ctx.userPet.id }, data: { hunger, bond } });
        if (food.xpGain > 0) {
          const xpRes = await grantPetExperience(tx, ctx.userPet.id, food.xpGain);
          if (xpRes?.leveled) leveled = true;
        }
      });

      const updated = await getActivePetContext(userId);
      const passive = updated ? summarizePassiveBonus(updated.passive) : [];
      const embed = new EmbedBuilder()
        .setColor(0xf1c40f)
        .setTitle(`Has alimentado a ${updated?.userPet.pet.name ?? ctx.userPet.pet.name}`)
        .setDescription(describePet(updated?.userPet ?? ctx.userPet, passive))
        .addFields(
          {
            name: 'Efectos',
            value:
              `Hambre -${food.hungerRestore}\n` +
              `Afinidad +${food.bondGain}` +
              (food.xpGain > 0 ? `\nXP +${food.xpGain}` : ''),
          },
        );
      if (leveled) {
        embed.addFields({ name: '¡Nivel obtenido!', value: 'Tu mascota evolucionó internamente gracias al festín.', inline: false });
      }
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (sub === 'evolve') {
      const ctx = await getActivePetContext(userId);
      if (!ctx) {
        return interaction.reply({ content: 'Necesitas una mascota activa para evolucionar.', ephemeral: true });
      }
      const next = ctx.userPet.pet.evolvesTo;
      if (!next) {
        return interaction.reply({ content: `${ctx.userPet.pet.name} ya está en su forma final.`, ephemeral: true });
      }
      const req = parseEvolutionRequirements(ctx.userPet.pet.requirements);
      const errors: string[] = [];
      if (req.level && ctx.userPet.level < req.level) {
        errors.push(`Nivel requerido ${req.level}.`);
      }
      if (req.bond && ctx.userPet.bond < req.bond) {
        errors.push(`Afinidad mínima ${req.bond}.`);
      }
      let itemsNeeded: { itemId: number; key: string; name: string; qty: number; have: number }[] = [];
      if (req.items?.length) {
        const itemRecords = await prisma.item.findMany({ where: { key: { in: req.items.map((x) => x.key) } } });
        const inv = await prisma.userItem.findMany({
          where: { userId, itemId: { in: itemRecords.map((x) => x.id) } },
        });
        itemsNeeded = req.items.map((entry) => {
          const record = itemRecords.find((it) => it.key === entry.key);
          const have = record ? inv.find((x) => x.itemId === record.id)?.quantity ?? 0 : 0;
          return {
            itemId: record?.id ?? 0,
            key: entry.key,
            name: record?.name ?? entry.key,
            qty: entry.qty,
            have,
          };
        });
        for (const item of itemsNeeded) {
          if (!item.itemId || item.have < item.qty) {
            errors.push(`Necesitas ${item.qty}× ${item.name}.`);
          }
        }
      }

      if (errors.length) {
        return interaction.reply({ content: `No puedes evolucionar todavía:\n• ${errors.join('\n• ')}`, ephemeral: true });
      }

      await prisma.$transaction(async (tx) => {
        for (const item of itemsNeeded) {
          if (!item.itemId) continue;
          await tx.userItem.update({
            where: { userId_itemId: { userId, itemId: item.itemId } },
            data: { quantity: { decrement: item.qty } },
          });
        }
        await tx.userPet.update({
          where: { id: ctx.userPet.id },
          data: {
            petId: next.id,
            xp: 0,
            evolved: true,
            hunger: clampPetGauge(ctx.userPet.hunger + 10),
            bond: clampPetGauge(Math.max(0, ctx.userPet.bond - 10)),
          },
        });
      });

      const updated = await getActivePetContext(userId);
      const passive = updated ? summarizePassiveBonus(updated.passive) : [];
      const embed = new EmbedBuilder()
        .setColor(0xe67e22)
        .setTitle(`¡${ctx.userPet.pet.name} evoluciona a ${next.name}!`)
        .setDescription(describePet(updated?.userPet ?? ctx.userPet, passive))
        .setFooter({ text: 'Las evoluciones desbloquean habilidades más poderosas.' });
      return interaction.reply({ embeds: [embed] });
    }

    if (sub === 'release') {
      const raw = interaction.options.getString('pet', true);
      const petId = Number(raw);
      if (!Number.isFinite(petId)) {
        return interaction.reply({ content: 'Selección inválida.', ephemeral: true });
      }
      const userPet = await prisma.userPet.findFirst({
        where: { id: petId, userId },
        include: { pet: true },
      });
      if (!userPet) {
        return interaction.reply({ content: 'No encontré esa mascota en tu colección.', ephemeral: true });
      }
      const otherPets = await prisma.userPet.count({ where: { userId, id: { not: petId } } });
      const summary = new EmbedBuilder()
        .setColor(0xc0392b)
        .setTitle(`¿Liberar a ${userPet.pet.name}?`)
        .setDescription(
          `Nivel ${userPet.level}, afinidad ${userPet.bond}/100. ${
            userPet.active
              ? 'Es tu mascota activa; la más reciente disponible pasará a estar activa.'
              : 'Pasará a explorar el mundo por su cuenta.'
          }`,
        )
        .setFooter({ text: otherPets ? 'Esta acción es permanente.' : 'Te quedarás sin mascotas si la liberas.' });

      const token = makeToken();
      pendingReleases.set(token, { userId, petId: userPet.id, expires: Date.now() + 2 * 60 * 1000 });
      scheduleCleanup(token);

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`pet:release-confirm:${token}`)
          .setLabel('Sí, liberar')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`pet:release-cancel:${token}`)
          .setLabel('Cancelar')
          .setStyle(ButtonStyle.Secondary),
      );

      return interaction.reply({ embeds: [summary], components: [row], ephemeral: true });
    }

    if (sub === 'setactive') {
      const raw = interaction.options.getString('pet', true);
      const petId = Number(raw);
      if (!Number.isFinite(petId)) {
        return interaction.reply({ content: 'Selección inválida.', ephemeral: true });
      }
      const target = await prisma.userPet.findFirst({ where: { id: petId, userId }, include: { pet: true } });
      if (!target) {
        return interaction.reply({ content: 'Esa mascota no te pertenece.', ephemeral: true });
      }
      await prisma.$transaction(async (tx) => {
        await tx.userPet.updateMany({ where: { userId, active: true }, data: { active: false } });
        await tx.userPet.update({ where: { id: target.id }, data: { active: true } });
      });
      return interaction.reply({ content: `Ahora ${target.pet.name} es tu compañera activa.`, ephemeral: true });
    }
  },

  async autocomplete(interaction: AutocompleteInteraction) {
    const focused = interaction.options.getFocused(true);
    if (!focused?.name || focused.name !== 'pet') {
      if (focused?.name === 'item') {
        const query = String(focused.value ?? '').toLowerCase();
        const filtered = FEED_CHOICES.filter((choice) => choice.label.toLowerCase().includes(query)).slice(0, 25);
        return interaction.respond(
          (filtered.length ? filtered : FEED_CHOICES).map((choice) => ({ name: choice.label, value: choice.key })),
        );
      }
      return interaction.respond([]);
    }
    const pets = await fetchUserPets(interaction.user.id);
    const query = String(focused.value ?? '').toLowerCase();
    const options = pets
      .filter((pet) => {
        const text = `${pet.pet.name} ${pet.pet.key} ${pet.level}`.toLowerCase();
        return text.includes(query);
      })
      .slice(0, 25)
      .map((pet) => ({
        name: `${pet.pet.name} · Nv ${pet.level}${pet.active ? ' ⭐' : ''}`,
        value: pet.id.toString(),
      }));
    await interaction.respond(options);
  },

  async handleInteraction(interaction: ButtonInteraction) {
    if (!interaction.isButton()) return;
    const [ns, action, token] = interaction.customId.split(':');
    if (ns !== 'pet') return;
    if (action === 'release-cancel') {
      pendingReleases.delete(token);
      if (interaction.replied || interaction.deferred) {
        await interaction.editReply({ content: 'Liberación cancelada.', components: [], embeds: [] });
      } else {
        await interaction.update({ content: 'Liberación cancelada.', components: [], embeds: [] });
      }
      return;
    }
    if (action === 'release-confirm') {
      const entry = token ? pendingReleases.get(token) : null;
      if (!entry || entry.userId !== interaction.user.id) {
        return interaction.reply({ content: 'La confirmación expiró o no es válida.', ephemeral: true });
      }
      pendingReleases.delete(token);
      const pet = await prisma.userPet.findFirst({ where: { id: entry.petId, userId: interaction.user.id }, include: { pet: true } });
      if (!pet) {
        return interaction.reply({ content: 'Esa mascota ya no está disponible.', ephemeral: true });
      }
      await prisma.$transaction(async (tx) => {
        await tx.userPet.delete({ where: { id: pet.id } });
        if (pet.active) {
          const candidate = await tx.userPet.findFirst({
            where: { userId: interaction.user.id },
            orderBy: [{ level: 'desc' }, { createdAt: 'asc' }],
            include: { pet: true },
          });
          if (candidate) {
            await tx.userPet.update({ where: { id: candidate.id }, data: { active: true } });
          }
        }
      });
      const replacement = pet.active
        ? await prisma.userPet.findFirst({
            where: { userId: interaction.user.id, active: true },
            include: { pet: true },
          })
        : null;
      const lines = [`Has liberado a ${pet.pet.name}. ¡Buen viaje!`];
      if (replacement) {
        lines.push(`Ahora ${replacement.pet.name} acompaña tus aventuras.`);
      }
      if (interaction.replied || interaction.deferred) {
        await interaction.editReply({ content: lines.join('\n'), components: [], embeds: [] });
      } else {
        await interaction.update({ content: lines.join('\n'), components: [], embeds: [] });
      }
    }
  },
};
