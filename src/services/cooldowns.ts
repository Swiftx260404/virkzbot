const cooldowns = new Map<string, number>();

export function onCooldown(key: string, ms: number): {ok: boolean, remaining: number} {
  const now = Date.now();
  const until = cooldowns.get(key) ?? 0;
  if (until > now) {
    return { ok: false, remaining: until - now };
  }
  cooldowns.set(key, now + ms);
  return { ok: true, remaining: 0 };
}
