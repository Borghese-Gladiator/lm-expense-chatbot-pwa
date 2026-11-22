const hits = new Map<string, { n: number; reset: number }>();

export function tooMany(key: string, max: number, windowMs: number, now = Date.now()): boolean {
  if (hits.size > 1000) for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);
  const h = hits.get(key);
  if (!h || h.reset <= now) {
    hits.set(key, { n: 1, reset: now + windowMs });
    return false;
  }
  return ++h.n > max;
}

export const resetLimits = () => hits.clear();
