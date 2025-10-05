import crypto from 'node:crypto';

export interface TradeItemOffer {
  itemId: number;
  quantity: number;
  name: string;
}

export interface TradeParticipant {
  userId: string;
  items: TradeItemOffer[];
  confirmed: boolean;
  updatedAt: number;
}

export interface TradeSession {
  id: string;
  initiatorId: string;
  targetId: string;
  channelId: string;
  messageId: string;
  guildId?: string;
  createdAt: number;
  expiresAt: number;
  offers: Record<string, TradeParticipant>;
  lastUpdated: number;
}

const EXPIRATION_MS = 2 * 60 * 1000;

const sessions = new Map<string, TradeSession>();
const userToSession = new Map<string, string>();
const messageToSession = new Map<string, string>();

function now() {
  return Date.now();
}

function makeParticipant(userId: string): TradeParticipant {
  const timestamp = now();
  return {
    userId,
    items: [],
    confirmed: false,
    updatedAt: timestamp
  };
}

export function createTradeSession(params: {
  initiatorId: string;
  targetId: string;
  channelId: string;
  guildId?: string;
}): TradeSession {
  const id = crypto.randomUUID();
  const timestamp = now();
  const session: TradeSession = {
    id,
    initiatorId: params.initiatorId,
    targetId: params.targetId,
    channelId: params.channelId,
    guildId: params.guildId,
    messageId: '',
    createdAt: timestamp,
    expiresAt: timestamp + EXPIRATION_MS,
    offers: {
      [params.initiatorId]: makeParticipant(params.initiatorId),
      [params.targetId]: makeParticipant(params.targetId)
    },
    lastUpdated: timestamp
  };
  sessions.set(id, session);
  userToSession.set(params.initiatorId, id);
  userToSession.set(params.targetId, id);
  return session;
}

export function bindSessionMessage(sessionId: string, messageId: string) {
  const session = sessions.get(sessionId);
  if (!session) return;
  session.messageId = messageId;
  messageToSession.set(messageId, sessionId);
}

export function getTradeSessionByMessage(messageId: string) {
  const sessionId = messageToSession.get(messageId);
  if (!sessionId) return null;
  const session = sessions.get(sessionId) ?? null;
  if (session && isSessionExpired(session)) {
    clearTradeSession(sessionId);
    return null;
  }
  return session;
}

export function getTradeSessionForUser(userId: string) {
  const sessionId = userToSession.get(userId);
  if (!sessionId) return null;
  const session = sessions.get(sessionId) ?? null;
  if (session && isSessionExpired(session)) {
    clearTradeSession(sessionId);
    return null;
  }
  return session;
}

export function touchTradeSession(sessionId: string) {
  const session = sessions.get(sessionId);
  if (!session) return null;
  const timestamp = now();
  session.expiresAt = timestamp + EXPIRATION_MS;
  session.lastUpdated = timestamp;
  return session;
}

export function clearTradeSession(sessionId: string) {
  const session = sessions.get(sessionId);
  if (!session) return;
  sessions.delete(sessionId);
  userToSession.delete(session.initiatorId);
  userToSession.delete(session.targetId);
  if (session.messageId) {
    messageToSession.delete(session.messageId);
  }
}

export function setTradeOffer(sessionId: string, userId: string, items: TradeItemOffer[]) {
  const session = sessions.get(sessionId);
  if (!session) return null;
  const participant = session.offers[userId];
  if (!participant) return null;

  participant.items = items;
  participant.confirmed = false;
  participant.updatedAt = now();

  for (const [key, offer] of Object.entries(session.offers)) {
    if (key !== userId) {
      offer.confirmed = false;
    }
  }

  session.lastUpdated = now();
  session.expiresAt = session.lastUpdated + EXPIRATION_MS;
  return session;
}

export function setConfirmation(sessionId: string, userId: string, value: boolean) {
  const session = sessions.get(sessionId);
  if (!session) return null;
  const participant = session.offers[userId];
  if (!participant) return null;
  participant.confirmed = value;
  participant.updatedAt = now();
  session.lastUpdated = participant.updatedAt;
  session.expiresAt = session.lastUpdated + EXPIRATION_MS;
  return session;
}

export function isSessionExpired(session: TradeSession) {
  return now() > session.expiresAt;
}

export function getOtherParticipant(session: TradeSession, userId: string) {
  if (session.initiatorId === userId) return session.targetId;
  if (session.targetId === userId) return session.initiatorId;
  return null;
}

export function getSessionParticipants(session: TradeSession) {
  return [session.initiatorId, session.targetId];
}
