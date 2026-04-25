import { LRUCache } from "lru-cache";

export function makeCache<V extends {}>(opts?: {
  max?: number;
  ttlMs?: number;
}) {
  return new LRUCache<string, V>({
    max: opts?.max ?? 500,
    ttl: opts?.ttlMs ?? 1000 * 60 * 60, // 1 h default
  });
}
