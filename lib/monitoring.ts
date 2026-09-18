import type { PartOffer } from "@/lib/phaeton/types";
import { checkPhaetonSearchHealth, type PhaetonHealth } from "@/lib/phaeton/health";
import { searchShatemOffers } from "@/lib/shatem/search";
import { searchAutotradeOffers } from "@/lib/autotrade/search";
import { autotradeConfigured } from "@/lib/autotrade/session";
import { searchInterkomOffers } from "@/lib/interkom/search";
import { interkomConfigured } from "@/lib/interkom/session";
import { getSetting } from "@/lib/sheets/settings";

/**
 * ЧЕСТНЫЕ пробы всех поставщиков — единый механизм, как у Phaeton
 * (см. lib/phaeton/health). Гоняем «сентинел»-артикулы через ТУ ЖЕ функцию
 * поиска, что видит покупатель, и считаем офферы, реально доступные в Астане
 * (склад Астаны, остаток>0). ok = есть остаток; иначе «ответил, но пусто»
 * (no_astana_stock — регрессия склада/фильтра/сессии) или ошибка (auth/сеть).
 *
 * Все поставщики ходят через один KZ-прокси. Если прокси лёг — пробы не
 * запускаем (крон это делает), чтобы не плодить дубли к алерту прокси.
 */
export interface SupplierHealth {
  configured: boolean;
  disabled?: boolean;
  ok: boolean;
  offers: number;
  error?: string;
  ms?: number;
}

function sentinels(): string[] {
  const env = (
    process.env.SUPPLIER_HEALTH_ARTICLES ??
    process.env.PHAETON_HEALTH_ARTICLES ??
    ""
  )
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  // Ходовые расходники, обычно есть в Астане у нескольких поставщиков.
  return env.length ? env : ["0986424815", "0451103316", "OC90"];
}

async function probeVia(
  searchOne: (art: string) => Promise<PartOffer[]>
): Promise<{ ok: boolean; offers: number; error?: string }> {
  const res = await Promise.allSettled(sentinels().map(searchOne));
  let offers = 0;
  let anyResponded = false;
  let lastErr: string | undefined;
  for (const r of res) {
    if (r.status === "fulfilled") {
      anyResponded = true;
      offers += r.value.filter((o) => o.atAstana && o.quantity > 0).length;
    } else {
      lastErr = (r.reason as Error)?.message?.slice(0, 200);
    }
  }
  const ok = offers > 0;
  return {
    ok,
    offers,
    error: ok ? undefined : anyResponded ? "no_astana_stock" : lastErr ?? "all_failed",
  };
}

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { at: number; result: SupplierHealth }>();
async function withCache(
  key: string,
  fn: () => Promise<SupplierHealth>
): Promise<SupplierHealth> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.result;
  const result = await fn();
  cache.set(key, { at: Date.now(), result });
  return result;
}

/** Phaeton (Р1) — переиспользуем его собственную пробу, приводим к общему типу. */
export async function probePhaeton(): Promise<SupplierHealth> {
  const h: PhaetonHealth = await checkPhaetonSearchHealth();
  return { configured: h.configured, ok: h.ok, offers: h.offers, error: h.error, ms: h.ms };
}

/** Shate-M (М2) — тот же apikey-поиск, что и в выдаче. */
export async function probeShatem(): Promise<SupplierHealth> {
  if (!process.env.SHATEM_API_KEY) return { configured: false, ok: false, offers: 0 };
  return withCache("shatem", async () => {
    const t0 = Date.now();
    const r = await probeVia((a) => searchShatemOffers(a, { markupPct: 0 }));
    return { configured: true, ...r, ms: Date.now() - t0 };
  });
}

/** Autotrade (Т3-Т5) — та же веб-сессия/поиск, что и в выдаче. */
export async function probeAutotrade(): Promise<SupplierHealth> {
  if (!autotradeConfigured()) return { configured: false, ok: false, offers: 0 };
  return withCache("autotrade", async () => {
    const t0 = Date.now();
    const r = await probeVia((a) => searchAutotradeOffers(a, { markupPct: 0 }));
    return { configured: true, ...r, ms: Date.now() - t0 };
  });
}

/** Interkom (И6) — пробуем только если включён тумблером interkom_enabled. */
export async function probeInterkom(): Promise<SupplierHealth> {
  if (!interkomConfigured()) return { configured: false, ok: false, offers: 0 };
  const enabled =
    ((await getSetting("interkom_enabled").catch(() => "off")) ?? "off").trim() === "on";
  if (!enabled) return { configured: true, disabled: true, ok: false, offers: 0 };
  return withCache("interkom", async () => {
    const t0 = Date.now();
    // allSegments=true — ищем по всем сегментам (как «любое авто»), чтобы проба
    // не зависела от выбранной марки.
    const r = await probeVia((a) =>
      searchInterkomOffers(a, { markupPct: 0, allSegments: true })
    );
    return { configured: true, ...r, ms: Date.now() - t0 };
  });
}
