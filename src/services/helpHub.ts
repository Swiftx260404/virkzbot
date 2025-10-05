// src/services/helpHub.ts
import {
  ActionRowBuilder,
  APIEmbedField,
  ButtonBuilder,
  ButtonStyle,
  Client,
  EmbedBuilder,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';

export type HelpCommandInfo = {
  name: string;
  description: string;
  usage?: string;
};

export type HelpCategory = {
  key: string;
  label: string;
  emoji: string;
  color: number;
  blurb: string;
  match?: RegExp;         // Regla para clasificar por nombre de comando
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

// ========================= DINÁMICO =========================

// Reglas de clasificación (ajústalas si cambias tu set de comandos)
const CATEGORY_RULES: Omit<HelpCategory, 'commands'>[] = [
  {
    key: 'core',
    label: 'Core',
    emoji: '🧭',
    color: 0x5865f2,
    blurb: 'Comandos esenciales para comenzar y conocer tu progreso en Virkz.',
    match: /^(start|profile|help|settings|daily|streak)$/i,
  },
  {
    key: 'economy',
    label: 'Economía/Trabajo',
    emoji: '💼',
    color: 0x43b581,
    blurb: 'Genera V Coins y recursos realizando actividades diarias y oficios.',
    match: /^(work|mine|fish|deliveries|cook)$/i,
  },
  {
    key: 'shop',
    label: 'Tienda/Inventario/Crafteo',
    emoji: '🛒',
    color: 0xf47b67,
    blurb: 'Administra tu inventario, compra, equipa, vende y fabrica objetos.',
    match: /^(shop|buy|inventory|equip|sell|use|disassemble|craft)$/i,
  },
  {
    key: 'rpg',
    label: 'RPG/Combate/Raids',
    emoji: '⚔️',
    color: 0x9b59b6,
    blurb: 'Actividades de progresión y combate. ¡Más características en camino!',
    match: /^(adventure|battle|skills|boss|raid|bounty)$/i,
  },
  {
    key: 'social',
    label: 'Social/Gremios',
    emoji: '🤝',
    color: 0xf9a62b,
    blurb: 'Funciones cooperativas y de comunidad.',
    match: /^(guild-|donate)/i,
  },
  {
    key: 'casino',
    label: 'Casino/Minijuegos',
    emoji: '🎲',
    color: 0xfaa61a,
    blurb: 'Juegos rápidos para poner a prueba tu suerte.',
    match: /^(blackjack|roulette|slots|rps|quickdraw|typing|rhythm|race)$/i,
  },
  {
    key: 'stats',
    label: 'Estadísticas/Logros',
    emoji: '📊',
    color: 0x57f287,
    blurb: 'Consulta logros y estadísticas de la cuenta.',
    match: /^(leaderboard|achievements|stats)$/i,
  },
  {
    key: 'market',
    label: 'Mercado/Tradeo',
    emoji: '📦',
    color: 0x00b0f4,
    blurb: 'Compra y vende con otros jugadores mediante herramientas seguras.',
    match: /^(market-|trade)/i,
  },
  {
    key: 'utility',
    label: 'Utilidad/Admin',
    emoji: '🛠️',
    color: 0x99aab5,
    blurb: 'Configuraciones y utilidades adicionales.',
    match: /^(admin-)/i,
  },
];

const OTHER_CATEGORY: Omit<HelpCategory, 'commands'> = {
  key: 'other',
  label: 'Otros',
  emoji: '✨',
  color: 0x7289da,
  blurb: 'Comandos sin categoría específica.',
};

let lastRefresh = 0;
const REFRESH_TTL_MS = 60_000;

// Exportamos como variable para mantener compatibilidad con tu import existente
export let HELP_CATEGORIES: HelpCategory[] = [];

/**
 * Reconstruye HELP_CATEGORIES desde los slash commands registrados en Discord.
 * Cachea 60s para evitar fetches constantes.
 */
export async function refreshHelpCategories(client: Client) {
  const now = Date.now();
  if (now - lastRefresh < REFRESH_TTL_MS && HELP_CATEGORIES.length) return;

  const coll = await client.application!.commands.fetch(); // globales
  const all: HelpCommandInfo[] = [...coll.values()].map((c) => ({
    name: c.name,
    description: c.description || '—',
  }));

  // Construir buckets
  const buckets: HelpCategory[] = CATEGORY_RULES.map((r) => ({ ...r, commands: [] }));
  const other: HelpCategory = { ...OTHER_CATEGORY, commands: [] };

  for (const cmd of all) {
    const target =
      buckets.find((b) => (b.match ? b.match.test(cmd.name) : false)) || other;
    target.commands.push(cmd);
  }

  // Filtrar categorías vacías; incluir "Otros" si aporta
  const visible = buckets.filter((b) => b.commands.length > 0);
  if (other.commands.length) visible.push(other);

  // Ordenar comandos alfabéticamente
  for (const b of visible) b.commands.sort((a, z) => a.name.localeCompare(z.name));

  HELP_CATEGORIES = visible;
  lastRefresh = now;
}

// ========================= SESIONES =========================

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

// ========================= UI =========================

export function buildHelpEmbed(state: HelpSessionState) {
  if (state.mode === 'search') {
    const embed = new EmbedBuilder()
      .setTitle('🔍 Resultados de búsqueda')
      .setColor(0xfee75c)
      .setDescription(
        state.query ? `Coincidencias para **${state.query}**` : 'Escribe algo para buscar comandos.',
      );

    const results = state.results ?? [];
    if (!results.length) {
      embed.addFields({ name: 'Sin resultados', value: 'No se encontraron comandos que coincidan.' });
    } else {
      const pageResults = paginate(results, state.page);
      for (const cmd of pageResults.items) {
        embed.addFields({
          name: `/${cmd.name}`,
          value: cmd.description + (cmd.usage ? `\nUso: \`${cmd.usage}\`` : ''),
          inline: false,
        });
      }
      embed.setFooter({
        text: `Página ${pageResults.page + 1}/${Math.max(1, pageResults.totalPages)} · ${results.length} resultados`,
      });
    }

    return embed;
  }

  const category =
    HELP_CATEGORIES.find((c) => c.key === state.category) ?? HELP_CATEGORIES[0];

  const embed = new EmbedBuilder()
    .setTitle(`${category?.emoji ?? '📚'} ${category?.label ?? 'Categoría'}`)
    .setColor(category?.color ?? 0x5865f2)
    .setDescription(category?.blurb ?? '');

  const list = category?.commands ?? [];
  const { items, totalPages, page } = paginate(list, state.page);

  if (!items.length) {
    embed.addFields({ name: 'Próximamente', value: 'Aún no hay comandos disponibles en esta categoría.' });
  } else {
    const fields: APIEmbedField[] = items.map((cmd) => ({
      name: `/${cmd.name}`,
      value: cmd.description + (cmd.usage ? `\nUso: \`${cmd.usage}\`` : ''),
      inline: false,
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
        default: category.key === state.category,
      })),
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

// ========================= UTIL =========================

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
      hasNext: current < totalPages - 1 && total > 0,
    };
  }
  const category =
    HELP_CATEGORIES.find((c) => c.key === state.category) ?? HELP_CATEGORIES[0];
  const total = category?.commands.length ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const current = Math.min(Math.max(0, state.page), totalPages - 1);
  return {
    hasPrev: current > 0,
    hasNext: current < totalPages - 1 && total > 0,
  };
}

// Modal de búsqueda (igual que tenías)
export function createSearchModal() {
  const input = new TextInputBuilder()
    .setCustomId('help:search-query')
    .setLabel('¿Qué comando buscas?')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Ejemplo: mine, trade, perfil')
    .setRequired(true)
    .setMaxLength(50);

  const row = new ActionRowBuilder<TextInputBuilder>().addComponents(input);

  return new ModalBuilder().setCustomId('help:search-modal').setTitle('Buscar comandos').addComponents(row);
}

// Devuelve todos los comandos del catálogo dinámico
export function getAllHelpCommands() {
  const map = new Map<string, HelpCommandInfo>();
  for (const category of HELP_CATEGORIES) {
    for (const cmd of category.commands) {
      if (!map.has(cmd.name)) map.set(cmd.name, cmd);
    }
  }
  return Array.from(map.values());
}

export function normalizeSearchQuery(query: string) {
  return query.trim().toLowerCase();
}

export function getHelpSessionSafe(interaction: { message?: { id: string } | null }) {
  const messageId = interaction.message?.id ?? undefined;
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
  const category =
    HELP_CATEGORIES.find((c) => c.key === state.category) ?? HELP_CATEGORIES[0];
  const total = category?.commands.length ?? 0;
  return Math.max(1, Math.ceil(total / PAGE_SIZE));
}

export function resetToCategory(state: HelpSessionState) {
  const updated = updateSession(state, {
    mode: 'category',
    page: 0,
    query: undefined,
    results: undefined,
  });
  return updated;
}