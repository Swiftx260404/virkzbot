import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { CONFIG } from '../config.js';
import {
  EventCalendarEntry,
  getEventCalendar,
  getEventTemplates,
  triggerManualSync,
} from '../services/eventScheduler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(process.cwd(), 'src', 'data');
const CALENDAR_PATH = path.join(DATA_DIR, 'event-calendar.json');
const TEMPLATE_PATH = path.join(__dirname, 'template.html');

const PANEL_HTML = await fs.readFile(TEMPLATE_PATH, 'utf8');

const app = express();
app.use(express.json());

const PANEL_TOKEN = CONFIG.eventPanelToken || process.env.EVENT_PANEL_TOKEN || '';

function requireToken(req: Request, res: Response, next: NextFunction) {
  if (!PANEL_TOKEN) {
    return res.status(500).json({ error: 'EVENT_PANEL_TOKEN no configurado en el entorno.' });
  }
  const token = String(req.headers['x-panel-key'] ?? '');
  if (token !== PANEL_TOKEN) {
    return res.status(401).json({ error: 'Token inválido.' });
  }
  next();
}

function normalizeEntry(body: any): EventCalendarEntry {
  if (!body || typeof body !== 'object') {
    throw new Error('Payload inválido');
  }
  const templateKey = String(body.templateKey ?? '').trim();
  if (!templateKey) {
    throw new Error('templateKey requerido');
  }
  const entry: EventCalendarEntry = { templateKey };
  if (body.startISO) {
    entry.startISO = String(body.startISO);
  }
  if (body.endISO) {
    entry.endISO = String(body.endISO);
  }
  if (body.durationHours !== undefined && body.durationHours !== null && String(body.durationHours).trim() !== '') {
    const duration = Number(body.durationHours);
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new Error('durationHours inválido');
    }
    entry.durationHours = duration;
  }
  if (body.rrule) {
    entry.rrule = String(body.rrule);
  }
  if (body.channels && typeof body.channels === 'object') {
    entry.channels = body.channels as Record<string, unknown>;
  } else if (body.announceChannel) {
    entry.channels = { announce: String(body.announceChannel) };
  }
  return entry;
}

async function readCalendarFile(): Promise<EventCalendarEntry[]> {
  const raw = await fs.readFile(CALENDAR_PATH, 'utf8');
  return JSON.parse(raw) as EventCalendarEntry[];
}

async function writeCalendarFile(entries: EventCalendarEntry[]) {
  await fs.writeFile(CALENDAR_PATH, JSON.stringify(entries, null, 2) + '\n');
}

app.get('/', (_req: Request, res: Response) => {
  res.type('html').send(PANEL_HTML);
});

app.get('/api/templates', requireToken, async (_req: Request, res: Response) => {
  const templates = await getEventTemplates();
  res.json(templates);
});

app.get('/api/calendar', requireToken, async (_req: Request, res: Response) => {
  const entries = await getEventCalendar();
  const plain = entries.map(({ rule, ...rest }) => rest);
  res.json(plain);
});

app.post('/api/calendar', requireToken, async (req: Request, res: Response) => {
  try {
    const entry = normalizeEntry(req.body);
    const calendar = await readCalendarFile();
    calendar.push(entry);
    await writeCalendarFile(calendar);
    res.json({ ok: true, index: calendar.length - 1 });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Entrada inválida' });
  }
});

app.put('/api/calendar/:index', requireToken, async (req: Request, res: Response) => {
  try {
    const index = Number(req.params.index);
    const calendar = await readCalendarFile();
    if (Number.isNaN(index) || index < 0 || index >= calendar.length) {
      return res.status(404).json({ error: 'Índice fuera de rango' });
    }
    const entry = normalizeEntry(req.body);
    calendar[index] = entry;
    await writeCalendarFile(calendar);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Entrada inválida' });
  }
});

app.delete('/api/calendar/:index', requireToken, async (req: Request, res: Response) => {
  const index = Number(req.params.index);
  const calendar = await readCalendarFile();
  if (Number.isNaN(index) || index < 0 || index >= calendar.length) {
    return res.status(404).json({ error: 'Índice fuera de rango' });
  }
  calendar.splice(index, 1);
  await writeCalendarFile(calendar);
  res.json({ ok: true });
});

app.post('/api/sync', requireToken, async (_req: Request, res: Response) => {
  await triggerManualSync();
  res.json({ ok: true });
});

const port = Number(process.env.EVENT_PANEL_PORT ?? 3344);
app.listen(port, () => {
  console.log(`Panel de eventos escuchando en http://localhost:${port}`);
});
