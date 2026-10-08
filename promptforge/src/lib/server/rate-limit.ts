import 'server-only';

/**
 * Rate limiter en memoria (ventana deslizante). Adecuado para una instancia única;
 * con varias instancias, sustituir por un almacén compartido (p. ej. Redis).
 */
const buckets = new Map<string, number[]>();
let lastSweep = Date.now();

export interface RateLimitResult {
  ok: boolean;
  retryAfterSeconds: number;
  remaining: number;
}

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  if (now - lastSweep > 60_000) {
    for (const [k, hits] of buckets) {
      if (!hits.length || now - hits[hits.length - 1] > 3_600_000) buckets.delete(k);
    }
    lastSweep = now;
  }
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    buckets.set(key, hits);
    return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((windowMs - (now - hits[0])) / 1000)), remaining: 0 };
  }
  hits.push(now);
  buckets.set(key, hits);
  return { ok: true, retryAfterSeconds: 0, remaining: limit - hits.length };
}

export function resetRateLimits(): void {
  buckets.clear();
}
