export function isHumanClickSequence(timestamps: number[]): boolean {
  // Reject if too many clicks in too little time or perfectly uniform
  if (timestamps.length < 2) return true;
  const deltas = timestamps.slice(1).map((t, i) => t - timestamps[i]);
  const sum = deltas.reduce((a,b)=>a+b,0);
  const avg = sum / deltas.length;
  const variance = deltas.reduce((a,b)=>a + Math.pow(b-avg,2), 0) / deltas.length;
  // Basic thresholds
  if (avg < 60) return false; // faster than ~16 clicks per second — suspicious
  if (variance < 20) return false; // too uniform — bot/macro-like
  return true;
}
