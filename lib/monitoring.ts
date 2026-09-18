import type { PartOffer } from "@/lib/phaeton/types";
import { checkPhaetonSearchHealth, type PhaetonHealth } from "@/lib/phaeton/health";
import { searchShatemOffers } from "@/lib/shatem/search";
import { searchAutotradeOffers } from "@/lib/autotrade/search";
import { autotradeConfigured } from "@/lib/autotrade/session";
import { searchInterkomOffers } from "@/lib/interkom/search";
import { interkomConfigured } from "@/lib/interkom/session";
import { getSetting } from "@/lib/sheets/settings";

/**
 * ЧЕСТНЫЕ пробы всех поставщиков. Гоняем «сентинел»-артикулы через ТУ ЖЕ
 * функцию поиска, что видит покупатель.
 *
 * ВАЖНО про семантику «сломано», чтобы НЕ было ложных тревог:
 *  - Phaeton (Р1): огромный каталог, сентинелы гарантированно есть в Астане →
 *    строгий сигнал: ok = есть остаток. Пусто = что-то сломано (whitelist/склад/
 *    фильтр) — так и ловили инцидент 2026-09-18.
 *  - Shate-M/Autotrade/Interkom: меньше номенклатура, конкретных сентинелов может
 *    просто не быть на складе → это НЕ поломка. Поэтому сигнал = ДОСТУПНОСТЬ:
 *    поиск отработал без жёсткой ошибки (их searchXxxOffers бросают только на
 *    auth/сети, а на пустой каталог возвращают []). ok = дозвонились; «down»
 *    только когда ВСЕ запросы упали (auth/сессия/сеть). Так «нет этих деталей»
 *    не путается с «поставщик отвалился».
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

// Доступность: поиск отработал хотя бы по одному сентинелу без жёсткого сбоя
// (пустой каталог = [] = «дозвонились»). `reachable=false` только когда ВСЕ
// запросы бросили (auth/сессия/сеть).
async function probeReachable(
  searchOne: (art: string) => Promise<PartOffer[]>
): Promise<{ reachable: boolean; offers: number; error?: string }> {
  const res = await Promise.allSettled(sentinels().map(searchOne));
  let offers = 0;
  let reachable = false;
  let lastErr: string | undefined;
  for (const r of res) {
    if (r.status === "fulfilled") {
      reachable = true;
      offers += r.value.filter((o) => o.atAstana && o.quantity > 0).length;
    } else {
      lastErr = (r.reason as Error)?.message?.slice(0, 200);
    }
  }
  return { reachable, offers, error: reachable ? undefined : lastErr ?? "all_failed" };
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

/** Shate-M (М2) — доступность apikey-поиска (пустой каталог = ок, не поломка). */
export async function probeShatem(): Promise<SupplierHealth> {
  if (!process.env.SHATEM_API_KEY) return { configured: false, ok: false, offers: 0 };
  return withCache("shatem", async () => {
    const t0 = Date.now();
    const r = await probeReachable((a) => searchShatemOffers(a, { markupPct: 0 }));
    return { configured: true, ok: r.reachable, offers: r.offers, error: r.error, ms: Date.now() - t0 };
  });
}

/** Autotrade (Т3-Т5) — доступность веб-сессии/поиска. */
export async function probeAutotrade(): Promise<SupplierHealth> {
  if (!autotradeConfigured()) return { configured: false, ok: false, offers: 0 };
  return withCache("autotrade", async () => {
    const t0 = Date.now();
    const r = await probeReachable((a) => searchAutotradeOffers(a, { markupPct: 0 }));
    return { configured: true, ok: r.reachable, offers: r.offers, error: r.error, ms: Date.now() - t0 };
  });
}

/** Interkom (И6) — доступность; пробуем только если включён тумблером. */
export async function probeInterkom(): Promise<SupplierHealth> {
  if (!interkomConfigured()) return { configured: false, ok: false, offers: 0 };
  const enabled =
    ((await getSetting("interkom_enabled").catch(() => "off")) ?? "off").trim() === "on";
  if (!enabled) return { configured: true, disabled: true, ok: false, offers: 0 };
  return withCache("interkom", async () => {
    const t0 = Date.now();
    // allSegments=true — по всем сегментам (как «любое авто»), проба не зависит от марки.
    const r = await probeReachable((a) =>
      searchInterkomOffers(a, { markupPct: 0, allSegments: true })
    );
    return { configured: true, ok: r.reachable, offers: r.offers, error: r.error, ms: Date.now() - t0 };
  });
}
