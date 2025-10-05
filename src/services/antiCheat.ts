interface SequenceState {
  key: string;
  start: number;
  timestamps: number[];
  windowMs: number;
}

const sequences = new Map<string, SequenceState>();

interface AntiCheatOptions {
  key: string;
  start: number;
  windowMs: number;
  timestamp?: number;
  minAverage?: number;
  minJitterRatio?: number;
  minFirstDelay?: number;
}

interface AntiCheatResult {
  ok: boolean;
  reason?: string;
}

const DEFAULT_MIN_AVERAGE = 120; // ms
const DEFAULT_MIN_JITTER_RATIO = 0.1;
const DEFAULT_MIN_FIRST_DELAY = 100;

export function registerSequenceSample(options: AntiCheatOptions): AntiCheatResult {
  const now = options.timestamp ?? Date.now();
  pruneSequences();
  let state = sequences.get(options.key);
  if (!state) {
    state = {
      key: options.key,
      start: options.start,
      timestamps: [],
      windowMs: options.windowMs
    };
    sequences.set(options.key, state);
  }

  if (now - state.start > options.windowMs) {
    // expired window, reset
    state.start = now;
    state.timestamps = [];
  }

  state.timestamps.push(now);

  if (state.timestamps.length < 3) {
    return { ok: true };
  }

  const deltas = state.timestamps.map((stamp, index) => {
    if (index === 0) return stamp - state.start;
    return stamp - state.timestamps[index - 1];
  });

  const avg = deltas.reduce((acc, value) => acc + value, 0) / deltas.length;
  const minAverage = options.minAverage ?? DEFAULT_MIN_AVERAGE;
  if (avg < minAverage) {
    return { ok: false, reason: 'Interacciones demasiado rápidas' };
  }

  const variance = deltas.reduce((acc, value) => acc + Math.pow(value - avg, 2), 0) / deltas.length;
  const jitterRatio = avg === 0 ? 0 : Math.sqrt(variance) / avg;
  const minJitterRatio = options.minJitterRatio ?? DEFAULT_MIN_JITTER_RATIO;
  if (jitterRatio < minJitterRatio) {
    return { ok: false, reason: 'Patrón de clicks demasiado uniforme' };
  }

  const minDelay = options.minFirstDelay ?? DEFAULT_MIN_FIRST_DELAY;
  if (deltas[0] < minDelay) {
    return { ok: false, reason: 'Latencia sospechosamente baja' };
  }

  const maxDelta = Math.max(...deltas);
  const minDelta = Math.min(...deltas);
  if (state.timestamps.length >= 4 && maxDelta - minDelta < 25) {
    return { ok: false, reason: 'Intervalos constantes detectados' };
  }

  return { ok: true };
}

export function resetSequence(key: string) {
  sequences.delete(key);
}

function pruneSequences() {
  const now = Date.now();
  for (const [key, value] of sequences.entries()) {
    if (now - value.start > value.windowMs * 2) {
      sequences.delete(key);
    }
  }
}
