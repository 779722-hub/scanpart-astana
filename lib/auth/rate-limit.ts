import { LRUCache } from "lru-cache";

interface Bucket {
  count: number;
  resetAt: number;
}

const cache = new LRUCache<string, Bucket>({
  max: 5000,
  ttl: 1000 * 60 * 15,
});

export function consume(key: string, limit: number, windowMs: number): {
  ok: boolean;
  remaining: number;
  retryAfter: number;
} {
  const now = Date.now();
  const cur = cache.get(key);
  if (!cur || cur.resetAt < now) {
    cache.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, retryAfter: 0 };
  }
  cur.count += 1;
  if (cur.count > limit) {
    return {
      ok: false,
      remaining: 0,
      retryAfter: Math.ceil((cur.resetAt - now) / 1000),
    };
  }
  return { ok: true, remaining: limit - cur.count, retryAfter: 0 };
}
