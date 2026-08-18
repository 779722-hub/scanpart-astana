import { fetch as undiciFetch } from "undici";
import { getProxyAgent, resetProxyAgent, resolveProxyUrl } from "./proxy";

/**
 * ЖИВОСТЬ KZ-ПРОКСИ. Все поставщики (Phaeton/Shate-M/Autotrade) ходят через один
 * прокси `PHAETON_PROXY_URL` — единая точка отказа, у которой бывают простои.
 * Проверяем коротким запросом ЧЕРЕЗ прокси к быстрой надёжной цели
 * (api.ipify.org отдаёт egress-IP почти мгновенно). На ошибке зовём
 * `resetProxyAgent`, чтобы восстановившийся прокси переподключился при следующей
 * проверке. Результат кешируется на ~30с, чтобы опрос дашборда не долбил прокси.
 * Всё fail-safe: функция никогда не бросает.
 */
export interface ProxyHealth {
  configured: boolean;
  ok: boolean;
  ms?: number;
  error?: string;
}

const CACHE_TTL_MS = 30_000;
let cache: { at: number; result: ProxyHealth } | null = null;

export async function checkProxyHealth(): Promise<ProxyHealth> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.result;

  const store = (result: ProxyHealth): ProxyHealth => {
    cache = { at: Date.now(), result };
    return result;
  };

  if (!resolveProxyUrl("PHAETON_PROXY_URL")) {
    return store({ configured: false, ok: false });
  }

  const dispatcher = getProxyAgent("PHAETON_PROXY_URL");
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 6000);
  const t0 = Date.now();
  try {
    const res = await undiciFetch("https://api.ipify.org", {
      dispatcher,
      signal: ctrl.signal,
    });
    return store({ configured: true, ok: res.ok, ms: Date.now() - t0 });
  } catch (err) {
    // Прокси-туннель мёртв → выселяем агент, чтобы поднявшийся прокси переподключился.
    resetProxyAgent("PHAETON_PROXY_URL");
    return store({ configured: true, ok: false, error: (err as Error).message });
  } finally {
    clearTimeout(t);
  }
}

/**
 * Решение об алерте по смене статуса прокси — чистая функция, чтобы её можно было
 * протестировать без сети. Алерт только на РЕАЛЬНОМ переходе; первый замер (prev
 * отсутствует) лишь сохраняется, без ложного алерта.
 */
export type ProxyStatus = "up" | "down";

export function proxyStatusTransition(
  prev: ProxyStatus | undefined,
  now: ProxyStatus
): { changed: boolean; alert?: ProxyStatus } {
  if (prev === undefined || prev === now) return { changed: false };
  return { changed: true, alert: now };
}
