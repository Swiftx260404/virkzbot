import crypto from 'node:crypto';
import type { EffectTarget, EffectType, Prisma } from '@prisma/client';
import { prisma } from '../lib/db.js';

export interface StoredBuff {
  label: string;
  effect: EffectType;
  target: EffectTarget;
  magnitude: number;
  until: number; // epoch ms
  itemId: number;
  itemKey: string;
  metadata?: Record<string, any> | null;
  stacks?: boolean;
}

export interface ActiveBuff extends StoredBuff {
  id: string;
}

export interface BuffState {
  root: Record<string, any>;
  active: ActiveBuff[];
  changed: boolean;
}

function isPlainObject(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normaliseBuff(raw: any, now: number): StoredBuff | null {
  if (!isPlainObject(raw)) return null;
  const until = Number(raw.until ?? 0);
  if (!Number.isFinite(until) || until <= now) return null;
  const effect = raw.effect as EffectType | undefined;
  const target = raw.target as EffectTarget | undefined;
  const magnitude = Number(raw.magnitude ?? 0);
  const itemId = Number(raw.itemId ?? 0);
  const itemKey = typeof raw.itemKey === 'string' ? raw.itemKey : '';
  if (!effect || !target || !itemId || !itemKey) return null;
  const label = typeof raw.label === 'string' ? raw.label : itemKey;
  const metadata = isPlainObject(raw.metadata) ? raw.metadata : undefined;
  const stacks = Boolean(raw.stacks ?? false);
  return { label, effect, target, magnitude, until, itemId, itemKey, metadata, stacks };
}

export function extractBuffState(metadata: Prisma.JsonValue | null | undefined, now = Date.now()): BuffState {
  const root: Record<string, any> = isPlainObject(metadata) ? { ...metadata } : {};
  const rawBuffs = isPlainObject(root.buffs) ? root.buffs : {};
  const nextBuffs: Record<string, StoredBuff> = {};
  const active: ActiveBuff[] = [];
  let changed = false;

  for (const [buffId, raw] of Object.entries(rawBuffs)) {
    const buff = normaliseBuff(raw, now);
    if (!buff) {
      changed = true;
      continue;
    }
    nextBuffs[buffId] = buff;
    active.push({ id: buffId, ...buff });
  }

  if (Object.keys(nextBuffs).length > 0) {
    root.buffs = nextBuffs;
  } else if (root.buffs) {
    delete root.buffs;
    changed = true;
  }

  return { root, active, changed };
}

export function appendBuffs(state: BuffState, incoming: StoredBuff[], now = Date.now()) {
  const store: Record<string, StoredBuff> = isPlainObject(state.root.buffs) ? { ...state.root.buffs } : {};
  const added: ActiveBuff[] = [];
  let mutated = false;

  for (const buff of incoming) {
    // purge expired before adding new ones
    if (buff.until <= now) continue;
    if (!buff.stacks) {
      for (const [key, existing] of Object.entries(store)) {
        if (existing.itemKey === buff.itemKey && existing.effect === buff.effect) {
          delete store[key];
          mutated = true;
        }
      }
    }
    const id = crypto.randomUUID();
    store[id] = buff;
    added.push({ id, ...buff });
    mutated = true;
  }

  if (Object.keys(store).length > 0) {
    state.root.buffs = store;
  } else if (state.root.buffs) {
    delete state.root.buffs;
    mutated = true;
  }

  if (mutated) {
    state.changed = true;
  }

  // refresh active list when mutated
  if (mutated) {
    const refreshed: ActiveBuff[] = [];
    for (const [id, buff] of Object.entries(store)) {
      refreshed.push({ id, ...buff });
    }
    state.active = refreshed;
  }

  return added;
}

export async function syncBuffMetadata(userId: string, state: BuffState) {
  if (!state.changed) return;
  await prisma.user.update({ where: { id: userId }, data: { metadata: state.root } });
  state.changed = false;
}

export function sumBuffs(buffs: ActiveBuff[], effect: EffectType, predicate?: (buff: ActiveBuff) => boolean) {
  return buffs
    .filter(buff => buff.effect === effect && (!predicate || predicate(buff)))
    .reduce((acc, buff) => acc + Number(buff.magnitude ?? 0), 0);
}

export function buffAppliesTo(buff: ActiveBuff, tag: string) {
  const meta = buff.metadata;
  if (!meta) return true;
  const raw = meta.appliesTo;
  if (!raw) return true;
  const tags = Array.isArray(raw) ? raw : [raw];
  return tags.includes(tag) || tags.includes('ANY');
}

export async function getActiveBuffs(userId: string, now = Date.now()) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { metadata: true } });
  if (!user) return [] as ActiveBuff[];
  const state = extractBuffState(user.metadata, now);
  if (state.changed) {
    await syncBuffMetadata(userId, state);
  }
  return state.active;
}
