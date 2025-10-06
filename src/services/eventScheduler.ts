import fs from 'node:fs/promises';
import path from 'node:path';
import { Client, TextChannel } from 'discord.js';
import RRuleLib from 'rrule';
import type { RRule, RRuleSet } from 'rrule';
import { prisma } from '../lib/db.js';
import { CONFIG } from '../config.js';
import {
  createEmptyModifierSnapshot,
  GlobalModifierSnapshot,
  setGlobalModifierSnapshot,
} from './globalEvents.js';
import { Prisma, type Event } from '@prisma/client';

type NullableJsonInput = Prisma.InputJsonValue | Prisma.JsonNullValueInput;

function toNullableJson(value: unknown): NullableJsonInput {
  return value === null || typeof value === 'undefined' ? Prisma.JsonNull : (value as Prisma.InputJsonValue);
}

export type EventTemplate = {
  key: string;
  name: string;
  description: string;
  bonuses?: Record<string, unknown>;
  drops?: unknown;
};

export type EventCalendarEntry = {
  templateKey: string;
  startISO?: string;
  endISO?: string;
  durationHours?: number;
  rrule?: string;
  channels?: Record<string, unknown>;
};

type ParsedCalendarEntry = EventCalendarEntry & { rule?: RRule | RRuleSet | null };

type ScheduledOccurrence = {
  template: EventTemplate;
  entry: ParsedCalendarEntry;
  start: Date;
  end: Date;
  occurrenceId: string;
};

const { rrulestr } = RRuleLib;

const templatePath = path.join(process.cwd(), 'src', 'data', 'events.json');
const calendarPath = path.join(process.cwd(), 'src', 'data', 'event-calendar.json');

let templateMap = new Map<string, EventTemplate>();
let templateList: EventTemplate[] = [];
let calendarEntries: ParsedCalendarEntry[] = [];
let lastLoaded = 0;
let clientRef: Client | null = null;
let timer: NodeJS.Timeout | null = null;
let syncing = false;

function parseJsonFile<T>(value: string, fallback: T): T {
  try {
    const parsed = JSON.parse(value);
    return parsed;
  } catch (err) {
    console.error('[events] Error parsing JSON file', err);
    return fallback;
  }
}

async function loadData(force = false) {
  if (!force && Date.now() - lastLoaded < 30_000 && templateList.length && calendarEntries.length) {
    return;
  }
  const [templatesRaw, calendarRaw] = await Promise.all([
    fs.readFile(templatePath, 'utf8'),
    fs.readFile(calendarPath, 'utf8'),
  ]);
  const templates = parseJsonFile<EventTemplate[]>(templatesRaw, []);
  templateList = templates.filter((tpl) => tpl && typeof tpl.key === 'string');
  templateMap = new Map(templateList.map((tpl) => [tpl.key, tpl]));

  const calendar = parseJsonFile<EventCalendarEntry[]>(calendarRaw, []);
  calendarEntries = calendar
    .filter((entry) => entry && typeof entry.templateKey === 'string')
    .map((entry) => ({ ...entry, rule: buildRule(entry) }));
  lastLoaded = Date.now();
}

function buildRule(entry: EventCalendarEntry) {
  if (!entry.rrule) return null;
  try {
    const options: { dtstart?: Date } = {};
    if (entry.startISO) {
      const start = new Date(entry.startISO);
      if (!Number.isNaN(start.getTime())) {
        options.dtstart = start;
      }
    }
    return rrulestr(entry.rrule, { forceset: true, dtstart: options.dtstart });
  } catch (err) {
    console.error('[events] Invalid RRULE for entry', entry.templateKey, err);
    return null;
  }
}

function occurrenceId(templateKey: string, start: Date) {
  return `${templateKey}:${start.toISOString()}`;
}

function computeDurationMs(entry: EventCalendarEntry) {
  if (entry.endISO && entry.startISO) {
    const start = new Date(entry.startISO);
    const end = new Date(entry.endISO);
    const diff = end.getTime() - start.getTime();
    if (Number.isFinite(diff) && diff > 0) {
      return diff;
    }
  }
  const hours = Number(entry.durationHours ?? 24);
  return Math.max(1, Math.round(hours)) * 60 * 60 * 1000;
}

function resolveOccurrence(entry: ParsedCalendarEntry, now: Date): ScheduledOccurrence | null {
  const template = templateMap.get(entry.templateKey);
  if (!template) return null;
  const duration = computeDurationMs(entry);

  if (entry.startISO && !entry.rrule) {
    const start = new Date(entry.startISO);
    const end = entry.endISO ? new Date(entry.endISO) : new Date(start.getTime() + duration);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
    if (start.getTime() <= now.getTime() && now.getTime() < end.getTime()) {
      return { template, entry, start, end, occurrenceId: occurrenceId(entry.templateKey, start) };
    }
    return null;
  }

  if (entry.rule) {
    const before = entry.rule.before(now, true);
    if (before) {
      const start = before;
      const end = new Date(start.getTime() + duration);
      if (now.getTime() < end.getTime()) {
        return { template, entry, start, end, occurrenceId: occurrenceId(entry.templateKey, start) };
      }
    }
  }
  return null;
}

function resolveUpcoming(entry: ParsedCalendarEntry, after: Date, limit = 5) {
  const template = templateMap.get(entry.templateKey);
  if (!template) return [];
  const duration = computeDurationMs(entry);
  const occurrences: ScheduledOccurrence[] = [];

  if (entry.startISO && !entry.rrule) {
    const start = new Date(entry.startISO);
    if (!Number.isNaN(start.getTime()) && start.getTime() >= after.getTime()) {
      const end = entry.endISO ? new Date(entry.endISO) : new Date(start.getTime() + duration);
      occurrences.push({ template, entry, start, end, occurrenceId: occurrenceId(entry.templateKey, start) });
    }
    return occurrences;
  }

  if (!entry.rule) return occurrences;
  let next = entry.rule.after(after, true);
  let safety = 0;
  while (next && occurrences.length < limit && safety < limit * 3) {
    const start = next;
    const end = new Date(start.getTime() + duration);
    occurrences.push({ template, entry, start, end, occurrenceId: occurrenceId(entry.templateKey, start) });
    next = entry.rule.after(start, false);
    safety += 1;
  }
  return occurrences;
}

async function ensureGlobalModifier(activeEvents: Event[]): Promise<GlobalModifierSnapshot> {
  const snapshot = createEmptyModifierSnapshot();
  snapshot.updatedAt = new Date().toISOString();
  snapshot.activeEvents = activeEvents.map((evt) => ({
    templateKey: evt.templateKey,
    name: evt.name,
    description: evt.description,
    startDate: evt.startDate.toISOString(),
    endDate: evt.endDate.toISOString(),
    bonuses: evt.bonuses as Record<string, unknown> | null,
    drops: evt.drops,
  }));

  for (const evt of activeEvents) {
    const bonuses = (evt.bonuses ?? {}) as Record<string, any>;
    const drops = Array.isArray(evt.drops) ? evt.drops : [];

    if (bonuses.economy) {
      const bonus = bonuses.economy as Record<string, any>;
      const multiplier = Number(bonus.multiplier ?? 1);
      const flat = Number(bonus.flat ?? bonus.flatBonus ?? 0);
      if (multiplier && Number.isFinite(multiplier) && multiplier !== 1) {
        if (Array.isArray(bonus.commands) && bonus.commands.length) {
          for (const cmd of bonus.commands) {
            const key = String(cmd);
            const current = snapshot.aggregates.economy.commands[key] ?? 1;
            snapshot.aggregates.economy.commands[key] = current * multiplier;
          }
        } else {
          snapshot.aggregates.economy.globalMultiplier *= multiplier;
        }
      }
      if (flat && Number.isFinite(flat) && flat !== 0) {
        if (Array.isArray(bonus.commands) && bonus.commands.length) {
          for (const cmd of bonus.commands) {
            const key = String(cmd);
            const current = snapshot.aggregates.economy.flat[key] ?? 0;
            snapshot.aggregates.economy.flat[key] = current + flat;
          }
        } else {
          snapshot.aggregates.economy.globalFlat += flat;
        }
      }
    }

    if (bonuses.drop) {
      const bonus = bonuses.drop as Record<string, any>;
      const multiplier = Number(bonus.multiplier ?? 1);
      const flatChance = Number(bonus.flatChance ?? 0);
      if (multiplier && Number.isFinite(multiplier) && multiplier !== 1) {
        snapshot.aggregates.drop.multiplier *= multiplier;
      }
      if (flatChance && Number.isFinite(flatChance) && flatChance !== 0) {
        snapshot.aggregates.drop.flatChance += flatChance;
      }
      if (Array.isArray(bonus.tags)) {
        for (const tag of bonus.tags) {
          const str = String(tag);
          if (!snapshot.aggregates.drop.tags.includes(str)) {
            snapshot.aggregates.drop.tags.push(str);
          }
        }
      }
    }

    if (bonuses.xp) {
      const multiplier = Number((bonuses.xp as Record<string, any>).multiplier ?? 1);
      if (multiplier && Number.isFinite(multiplier) && multiplier !== 1) {
        snapshot.aggregates.xp.multiplier *= multiplier;
      }
    }

    if (bonuses.fishing) {
      const multiplier = Number((bonuses.fishing as Record<string, any>).multiplier ?? 1);
      if (multiplier && Number.isFinite(multiplier) && multiplier !== 1) {
        snapshot.aggregates.fishing.multiplier *= multiplier;
      }
    }

    if (bonuses.craft) {
      const craftBonus = bonuses.craft as Record<string, any>;
      const cost = Number(craftBonus.costMultiplier ?? 1);
      const quality = Number(craftBonus.qualityMultiplier ?? 1);
      if (cost && Number.isFinite(cost) && cost !== 1) {
        snapshot.aggregates.craft.costMultiplier *= cost;
      }
      if (quality && Number.isFinite(quality) && quality !== 1) {
        snapshot.aggregates.craft.qualityMultiplier *= quality;
      }
    }

    if (bonuses.boss) {
      const boss = bonuses.boss as Record<string, any>;
      if (boss.spawn) {
        snapshot.aggregates.bosses.push({
          spawn: String(boss.spawn),
          templateKey: evt.templateKey,
          name: evt.name,
        });
      }
    }

    const dropEntries = Array.isArray(drops) ? drops : [];
    for (const drop of dropEntries) {
      if (!drop || typeof drop !== 'object') continue;
      const itemKey = String((drop as any).itemKey ?? '');
      const chance = Number((drop as any).chance ?? 0);
      if (!itemKey || chance <= 0) continue;
      const qtyMin = Number((drop as any).qtyMin ?? (drop as any).quantity?.min ?? 1);
      const qtyMax = Number((drop as any).qtyMax ?? (drop as any).quantity?.max ?? qtyMin ?? 1);
      const commands = Array.isArray((drop as any).commands) ? (drop as any).commands.map((cmd: any) => String(cmd)) : undefined;
      const tags = Array.isArray((drop as any).tags) ? (drop as any).tags.map((t: any) => String(t)) : undefined;
      snapshot.aggregates.eventDrops.push({
        itemKey,
        chance,
        qtyMin,
        qtyMax,
        commands,
        tags,
        templateKey: evt.templateKey,
        eventName: evt.name,
      });
    }

    const consumedKeys = new Set(['economy', 'drop', 'xp', 'fishing', 'craft', 'boss']);
    const other: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(bonuses)) {
      if (consumedKeys.has(key)) continue;
      other[key] = value;
    }
    if (Object.keys(other).length) {
      snapshot.aggregates.other[evt.templateKey] = other;
    }
  }

  const snapshotJson = snapshot as unknown as Prisma.InputJsonValue;
  await prisma.globalModifier.upsert({
    where: { id: 1 },
    update: { data: snapshotJson },
    create: { id: 1, data: snapshotJson },
  });
  setGlobalModifierSnapshot(snapshot);
  return snapshot;
}

function resolveAnnouncementChannel(entry: ParsedCalendarEntry | null, eventChannels: any): string | null {
  const candidate = eventChannels?.announce ?? entry?.channels?.announce;
  if (typeof candidate === 'string') {
    if (candidate === 'EVENT_CHANNEL_ID' || candidate === 'default') {
      return CONFIG.eventChannelId || null;
    }
    return candidate;
  }
  return CONFIG.eventChannelId || null;
}

function formatBonusesSummary(bonuses: Record<string, any> | undefined | null) {
  if (!bonuses || typeof bonuses !== 'object') return 'Bonos activos: —';
  const lines: string[] = [];
  if (bonuses.economy?.multiplier) {
    const commands = Array.isArray(bonuses.economy.commands) && bonuses.economy.commands.length
      ? ` (${bonuses.economy.commands.join(', ')})`
      : '';
    lines.push(`• Economía ×${Number(bonuses.economy.multiplier).toFixed(2)}${commands}`);
  }
  if (bonuses.drop?.multiplier) {
    const tags = Array.isArray(bonuses.drop.tags) && bonuses.drop.tags.length ? ` [${bonuses.drop.tags.join(', ')}]` : '';
    lines.push(`• Drops ×${Number(bonuses.drop.multiplier).toFixed(2)}${tags}`);
  }
  if (bonuses.xp?.multiplier) {
    lines.push(`• XP ×${Number(bonuses.xp.multiplier).toFixed(2)}`);
  }
  if (bonuses.fishing?.multiplier) {
    lines.push(`• Pesca ×${Number(bonuses.fishing.multiplier).toFixed(2)}`);
  }
  if (bonuses.craft?.costMultiplier || bonuses.craft?.qualityMultiplier) {
    const cost = bonuses.craft.costMultiplier ? `costo ×${Number(bonuses.craft.costMultiplier).toFixed(2)}` : '';
    const quality = bonuses.craft.qualityMultiplier ? `calidad ×${Number(bonuses.craft.qualityMultiplier).toFixed(2)}` : '';
    lines.push(`• Forja ${[cost, quality].filter(Boolean).join(' · ')}`.trim());
  }
  if (bonuses.boss?.spawn) {
    lines.push(`• Jefe especial: ${bonuses.boss.spawn}`);
  }
  if (!lines.length) {
    lines.push('• Bonos misteriosos activos');
  }
  return lines.join('\n');
}

async function announceEvent(event: Event, occurrence: ScheduledOccurrence | null, type: 'start' | 'end') {
  if (!clientRef) return;
  const channelId = resolveAnnouncementChannel(occurrence?.entry ?? null, event.channels ?? occurrence?.entry.channels ?? null);
  if (!channelId) return;
  try {
    const channel = await clientRef.channels.fetch(channelId);
    if (!channel || !(channel instanceof TextChannel)) return;
    if (type === 'start') {
      const startTs = Math.floor(event.startDate.getTime() / 1000);
      const endTs = Math.floor(event.endDate.getTime() / 1000);
      const bonuses = formatBonusesSummary(event.bonuses as Record<string, any> | null);
      await channel.send(
        `🎉 **${event.name}** ha comenzado\n${event.description}\n${bonuses}\nDuración: <t:${startTs}:F> → <t:${endTs}:F> (termina <t:${endTs}:R>)`
      );
    } else {
      await channel.send(`🏁 El evento **${event.name}** ha finalizado. ¡Gracias por participar!`);
    }
  } catch (err) {
    console.error('[events] Error announcing event', event.name, err);
  }
}

async function syncOnce(options: { forceReload?: boolean; announce?: boolean } = {}) {
  if (syncing) return;
  syncing = true;
  try {
    await loadData(options.forceReload);
    const now = new Date();
    const activeOccurrences = calendarEntries
      .map((entry) => resolveOccurrence(entry, now))
      .filter((occurrence): occurrence is ScheduledOccurrence => Boolean(occurrence));

    const occurrenceIds = activeOccurrences.map((occ) => occ.occurrenceId);
    const existingEvents = occurrenceIds.length
      ? await prisma.event.findMany({ where: { occurrenceId: { in: occurrenceIds } } })
      : [];
    const existingMap = new Map(existingEvents.map((evt) => [evt.occurrenceId, evt] as const));

    const started: Event[] = [];
    for (const occ of activeOccurrences) {
      const found = existingMap.get(occ.occurrenceId);
      if (!found) {
        const created = await prisma.event.create({
          data: {
            templateKey: occ.template.key,
            occurrenceId: occ.occurrenceId,
            name: occ.template.name,
            description: occ.template.description,
            startDate: occ.start,
            endDate: occ.end,
            bonuses: toNullableJson(occ.template.bonuses ?? null),
            drops: toNullableJson(occ.template.drops ?? []),
            channels: toNullableJson(occ.entry.channels ?? null),
            isActive: true,
          },
        });
        started.push(created);
      } else {
        if (
          !found.isActive ||
          found.startDate.getTime() !== occ.start.getTime() ||
          found.endDate.getTime() !== occ.end.getTime()
        ) {
          const updated = await prisma.event.update({
            where: { id: found.id },
            data: {
              startDate: occ.start,
              endDate: occ.end,
              isActive: true,
              channels: toNullableJson(occ.entry.channels ?? (found.channels as unknown) ?? null),
            },
          });
          if (!found.isActive) {
            started.push(updated);
          }
        }
      }
    }

    const activeEventsInDb = await prisma.event.findMany({ where: { isActive: true } });
    const ended: Event[] = [];
    for (const evt of activeEventsInDb) {
      if (occurrenceIds.includes(evt.occurrenceId)) {
        if (evt.endDate.getTime() <= now.getTime()) {
          const updated = await prisma.event.update({
            where: { id: evt.id },
            data: { isActive: false },
          });
          ended.push(updated);
        }
        continue;
      }
      if (evt.endDate.getTime() <= now.getTime()) {
        const updated = await prisma.event.update({ where: { id: evt.id }, data: { isActive: false } });
        ended.push(updated);
      }
    }

    const currentlyActive = await prisma.event.findMany({ where: { isActive: true }, orderBy: { startDate: 'asc' } });
    await ensureGlobalModifier(currentlyActive);

    if (options.announce !== false) {
      for (const evt of started) {
        const occ = activeOccurrences.find((o) => o.occurrenceId === evt.occurrenceId) ?? null;
        await announceEvent(evt, occ, 'start');
      }
      for (const evt of ended) {
        await announceEvent(evt, null, 'end');
      }
    }
  } catch (err) {
    console.error('[events] Error during scheduler sync', err);
  } finally {
    syncing = false;
  }
}

export async function startEventScheduler(client: Client) {
  clientRef = client;
  await loadData(true);
  await syncOnce({ forceReload: false, announce: false });
  if (timer) clearInterval(timer);
  const interval = Number(CONFIG.eventSchedulerIntervalMs ?? 15000) || 15000;
  timer = setInterval(() => {
    syncOnce().catch((err) => console.error('[events] Scheduled sync error', err));
  }, Math.max(5000, interval));
}

export async function triggerManualSync() {
  await syncOnce({ forceReload: true, announce: true });
}

export async function getEventTemplates() {
  await loadData(false);
  return templateList;
}

export async function getEventCalendar() {
  await loadData(false);
  return calendarEntries;
}

export async function findTemplate(term: string) {
  await loadData(false);
  const lc = term.toLowerCase();
  return templateList.find((tpl) => tpl.key.toLowerCase() === lc || tpl.name.toLowerCase() === lc) ?? null;
}

export async function getUpcomingOccurrences(limit = 10) {
  await loadData(false);
  const now = new Date();
  const upcoming: ScheduledOccurrence[] = [];
  for (const entry of calendarEntries) {
    const events = resolveUpcoming(entry, now, limit);
    for (const occ of events) {
      if (occ.start.getTime() <= now.getTime()) continue;
      upcoming.push(occ);
    }
  }
  upcoming.sort((a, b) => a.start.getTime() - b.start.getTime());
  return upcoming.slice(0, limit);
}

export async function getCurrentEvents() {
  const events = await prisma.event.findMany({ where: { isActive: true }, orderBy: { startDate: 'asc' } });
  return events;
}

export async function stopEventScheduler() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
