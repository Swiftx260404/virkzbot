import { ActionRowBuilder, APIEmbedField, ButtonBuilder, ButtonStyle, EmbedBuilder, ModalBuilder, StringSelectMenuBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';

type HelpCommandInfo = {
  name: string;
  description: string;
  usage?: string;
};

type HelpCategory = {
  key: string;
  label: string;
  emoji: string;
  color: number;
  blurb: string;
  commands: HelpCommandInfo[];
};

type HelpMode = 'category' | 'search';

export interface HelpSessionState {
  messageId: string;
  userId: string;
  category: string;
  page: number;
  mode: HelpMode;
  query?: string;
  results?: HelpCommandInfo[];
  ephemeral: boolean;
  createdAt: number;
}

const PAGE_SIZE = 5;

export const HELP_CATEGORIES: HelpCategory[] = [
  {
    key: 'core',
    label: 'Core',
    emoji: '🧭',
    color: 0x5865f2,
    blurb: 'Comandos esenciales para comenzar y conocer tu progreso en Virkz.',
    commands: [
      { name: 'start', description: 'Crea tu perfil y comienza tu aventura.' },
      { name: 'help', description: 'Abre este hub interactivo de ayuda.' },
      { name: 'profile', description: 'Consulta tu perfil, stats básicos y equipamiento.' }
    ]
  },
  {
    key: 'economy',
    label: 'Economía/Trabajo',
    emoji: '💼',
    color: 0x43b581,
    blurb: 'Genera V Coins y recursos realizando actividades diarias y oficios.',
    commands: [
      { name: 'daily', description: 'Reclama tu recompensa diaria de V Coins.' },
      { name: 'work', description: 'Completa un minijuego rápido para ganar monedas.' },
      { name: 'mine', description: 'Extrae recursos en minas desbloqueadas.' },
      { name: 'fish', description: 'Pesca distintos peces según tu caña y zona.' }
    ]
  },
  {
    key: 'shop',
    label: 'Tienda/Inventario/Crafteo',
    emoji: '🛒',
    color: 0xf47b67,
    blurb: 'Administra tu inventario, compra, equipa y vende objetos.',
    commands: [
      { name: 'shop', description: 'Explora el catálogo disponible en la tienda.' },
      { name: 'buy', description: 'Compra objetos utilizando tus V Coins.' },
      { name: 'inventory', description: 'Revisa los ítems de tu inventario.' },
      { name: 'equip', description: 'Equipa herramientas, armas o armaduras.' },
      { name: 'sell', description: 'Vende ítems vendibles de tu inventario.' }
    ]
  },
  {
    key: 'rpg',
    label: 'RPG/Combate/Raids',
    emoji: '⚔️',
    color: 0x9b59b6,
    blurb: 'Actividades de progresión y combate. ¡Más características en camino!',
    commands: [
      { name: 'mine', description: 'Obtén minerales y materiales raros.' },
      { name: 'fish', description: 'Consigue peces y recompensas temáticas.' }
    ]
  },
  {
    key: 'social',
    label: 'Social/Gremios',
    emoji: '🤝',
    color: 0xf9a62b,
    blurb: 'Funciones cooperativas y de comunidad. Próximamente más opciones.',
    commands: [
      { name: 'trade', description: 'Intercambia ítems de forma segura con otros jugadores.' }
    ]
  },
  {
    key: 'casino',
    label: 'Casino/Minijuegos',
    emoji: '🎲',
    color: 0xfaa61a,
    blurb: 'Juegos rápidos para poner a prueba tu suerte. ¡Mantente al tanto!',
    commands: []
  },
  {
    key: 'stats',
    label: 'Estadísticas/Logros',
    emoji: '📊',
    color: 0x57f287,
    blurb: 'Consulta logros, hitos y estadísticas de la cuenta.',
    commands: [
      { name: 'profile', description: 'Mira tu progreso, nivel y equipamiento actual.' }
    ]
  },
  {
    key: 'market',
    label: 'Mercado/Tradeo',
    emoji: '📦',
    color: 0x00b0f4,
    blurb: 'Compra y vende con otros jugadores mediante herramientas seguras.',
    commands: [
      { name: 'trade', description: 'Inicia un intercambio P2P con confirmación doble.' }
    ]
  },
  {
    key: 'utility',
    label: 'Utilidad/Admin',
    emoji: '🛠️',
    color: 0x99aab5,
    blurb: 'Configuraciones y utilidades adicionales para staff y jugadores.',
    commands: []
  }
];

const helpSessions = new Map<string, HelpSessionState>();

export function setHelpSession(state: HelpSessionState) {
  helpSessions.set(state.messageId, state);
}

export function getHelpSession(messageId: string) {
  const state = helpSessions.get(messageId);
  if (!state) return null;
  if (Date.now() - state.createdAt > 60 * 60 * 1000) {
    helpSessions.delete(messageId);
    return null;
  }
  return state;
}

export function deleteHelpSession(messageId: string) {
  helpSessions.delete(messageId);
}

export function buildHelpEmbed(state: HelpSessionState) {
  if (state.mode === 'search') {
    const embed = new EmbedBuilder()
      .setTitle('🔍 Resultados de búsqueda')
      .setColor(0xfee75c)
      .setDescription(state.query ? `Coincidencias para **${state.query}**` : 'Escribe algo para buscar comandos.');

    const results = state.results ?? [];
    if (!results.length) {
      embed.addFields({ name: 'Sin resultados', value: 'No se encontraron comandos que coincidan.' });
    } else {
      const pageResults = paginate(results, state.page);
      for (const cmd of pageResults.items) {
        embed.addFields({
          name: `/${cmd.name}`,
          value: cmd.description + (cmd.usage ? `\nUso: \`${cmd.usage}\`` : ''),
          inline: false
        });
      }
      embed.setFooter({ text: `Página ${pageResults.page + 1}/${Math.max(1, pageResults.totalPages)} · ${results.length} resultados` });
    }

    return embed;
  }

  const category = HELP_CATEGORIES.find((c) => c.key === state.category) ?? HELP_CATEGORIES[0];
  const embed = new EmbedBuilder()
    .setTitle(`${category.emoji} ${category.label}`)
    .setColor(category.color)
    .setDescription(category.blurb);

  const { items, totalPages, page } = paginate(category.commands, state.page);
  if (!items.length) {
    embed.addFields({ name: 'Próximamente', value: 'Aún no hay comandos disponibles en esta categoría.' });
  } else {
    const fields: APIEmbedField[] = items.map((cmd) => ({
      name: `/${cmd.name}`,
      value: cmd.description + (cmd.usage ? `\nUso: \`${cmd.usage}\`` : ''),
      inline: false
    }));
    embed.addFields(fields);
  }
  embed.setFooter({ text: `Página ${page + 1}/${Math.max(1, totalPages)}` });
  return embed;
}

export function buildHelpComponents(state: HelpSessionState) {
  const select = new StringSelectMenuBuilder()
    .setCustomId('help:cat')
    .setPlaceholder('Selecciona una categoría')
    .addOptions(
      HELP_CATEGORIES.map((category) => ({
        label: `${category.emoji} ${category.label}`,
        value: category.key,
        description: category.blurb.substring(0, 95),
        default: category.key === state.category
      }))
    );

  const row1 = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);

  const pagination = calculatePagination(state);

  const backBtn = new ButtonBuilder()
    .setCustomId('help:page:prev')
    .setLabel('◀️ Atrás')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(!pagination.hasPrev);

  const nextBtn = new ButtonBuilder()
    .setCustomId('help:page:next')
    .setLabel('Siguiente ▶️')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(!pagination.hasNext);

  const searchBtn = new ButtonBuilder()
    .setCustomId('help:search')
    .setLabel(state.mode === 'search' ? 'Buscar de nuevo' : '🔍 Buscar')
    .setStyle(ButtonStyle.Primary);

  const controls = new ActionRowBuilder<ButtonBuilder>().addComponents(backBtn, nextBtn, searchBtn);

  if (state.mode === 'search') {
    const resetBtn = new ButtonBuilder()
      .setCustomId('help:reset')
      .setLabel('Volver a categorías')
      .setStyle(ButtonStyle.Secondary);
    controls.addComponents(resetBtn);
  }

  return [row1, controls];
}

function paginate<T>(list: T[], page: number) {
  const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(0, page), totalPages - 1);
  const start = safePage * PAGE_SIZE;
  const items = list.slice(start, start + PAGE_SIZE);
  return { items, totalPages, page: safePage };
}

function calculatePagination(state: HelpSessionState) {
  if (state.mode === 'search') {
    const total = state.results?.length ?? 0;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const current = Math.min(Math.max(0, state.page), totalPages - 1);
    return {
      hasPrev: current > 0,
      hasNext: current < totalPages - 1 && total > 0
    };
  }
  const category = HELP_CATEGORIES.find((c) => c.key === state.category) ?? HELP_CATEGORIES[0];
  const total = category.commands.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const current = Math.min(Math.max(0, state.page), totalPages - 1);
  return {
    hasPrev: current > 0,
    hasNext: current < totalPages - 1 && total > 0
  };
}

export function createSearchModal() {
  const input = new TextInputBuilder()
    .setCustomId('help:search-query')
    .setLabel('¿Qué comando buscas?')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Ejemplo: mine, trade, perfil')
    .setRequired(true)
    .setMaxLength(50);

  const row = new ActionRowBuilder<TextInputBuilder>().addComponents(input);

  return new ModalBuilder()
    .setCustomId('help:search-modal')
    .setTitle('Buscar comandos')
    .addComponents(row);
}

export function getAllHelpCommands() {
  const map = new Map<string, HelpCommandInfo>();
  for (const category of HELP_CATEGORIES) {
    for (const cmd of category.commands) {
      if (!map.has(cmd.name)) {
        map.set(cmd.name, cmd);
      }
    }
  }
  return Array.from(map.values());
}

export function normalizeSearchQuery(query: string) {
  return query.trim().toLowerCase();
}

export function getHelpSessionSafe(interaction: { message?: { id: string } }) {
  const messageId = interaction.message?.id;
  if (!messageId) return null;
  return getHelpSession(messageId);
}

export function ensureSessionOwner(state: HelpSessionState | null, userId: string) {
  if (!state) {
    return { ok: false as const, reply: { content: 'La sesión de ayuda ya no está activa.', ephemeral: true } };
  }
  if (state.userId !== userId) {
    return { ok: false as const, reply: { content: 'Solo quien ejecutó `/help` puede controlar este menú.', ephemeral: true } };
  }
  return { ok: true as const };
}

export function updateSession(state: HelpSessionState, updates: Partial<HelpSessionState>) {
  const merged = { ...state, ...updates, createdAt: Date.now() };
  setHelpSession(merged);
  return merged;
}

export function computeSearchResults(query: string) {
  const normalized = normalizeSearchQuery(query);
  const catalog = getAllHelpCommands();
  const results = catalog.filter((cmd) => {
    const target = `${cmd.name} ${cmd.description} ${cmd.usage ?? ''}`.toLowerCase();
    return target.includes(normalized);
  });
  return { normalized, results };
}

export function getTotalPages(state: HelpSessionState) {
  if (state.mode === 'search') {
    const total = state.results?.length ?? 0;
    return Math.max(1, Math.ceil(total / PAGE_SIZE));
  }
  const category = HELP_CATEGORIES.find((c) => c.key === state.category) ?? HELP_CATEGORIES[0];
  const total = category.commands.length;
  return Math.max(1, Math.ceil(total / PAGE_SIZE));
}

export function resetToCategory(state: HelpSessionState) {
  const updated = updateSession(state, {
    mode: 'category',
    page: 0,
    query: undefined,
    results: undefined
  });
  return updated;
}
