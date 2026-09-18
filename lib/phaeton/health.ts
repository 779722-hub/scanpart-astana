import { searchBrands, searchPrices } from "./client";
import { getAstanaWarehouseIds } from "./astana-warehouse";
import type { PhaetonPriceItem } from "./types";

/**
 * ЧЕСТНАЯ проверка работоспособности Phaeton (Р1): не пинг корня, а РЕАЛЬНАЯ
 * выдача через прокси. Прогоняем 2-3 «сентинел»-артикула (ходовые расходники,
 * которые почти всегда есть на складе Астаны) и считаем офферы, реально
 * доступные в Астане (остаток>0, склад Астаны). Логика повторяет фильтр фазы
 * поиска, поэтому сигнал совпадает с тем, что видит покупатель.
 *
 * Итог:
 *  - ok:true  — хотя бы по одному сентинелу есть остаток в Астане (поиск живой);
 *  - ok:false, error="no_astana_stock" — API ответил, но остатка нет НИ ПО ОДНОМУ
 *    (регрессия склада/фильтра, как инцидент 2026-09-18; три ходовых номера разом
 *    не кончаются — значит сломан путь, а не совпадение);
 *  - ok:false, error=<msg> — все запросы упали (прокси/whitelist/API недоступны).
 *
 * Всё fail-safe: не бросает. Кэш ~60с, чтобы частый опрос не долбил Phaeton.
 */
export interface PhaetonHealth {
  configured: boolean;
  ok: boolean;
  offers: number;
  error?: string;
  ms?: number;
}

const CACHE_TTL_MS = 60_000;
let cache: { at: number; result: PhaetonHealth } | null = null;

function sentinelArticles(): string[] {
  const env = (process.env.PHAETON_HEALTH_ARTICLES ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  // Дефолтные сентинелы — ходовые фильтры/колодки, подтверждённые в наличии в
  // Астане 2026-09-18. Переопределяются env PHAETON_HEALTH_ARTICLES при желании.
  return env.length ? env : ["0986424815", "0451103316", "OC90"];
}

export async function checkPhaetonSearchHealth(): Promise<PhaetonHealth> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.result;
  const store = (result: PhaetonHealth): PhaetonHealth => {
    cache = { at: Date.now(), result };
    return result;
  };

  if (!process.env.PHAETON_API_KEY) {
    return store({ configured: false, ok: false, offers: 0 });
  }

  const t0 = Date.now();
  const whIds = await getAstanaWarehouseIds().catch(() => [] as string[]);
  const isAstana = (i: PhaetonPriceItem): boolean =>
    (whIds.length > 0 && !!i.WarehouseId && whIds.includes(i.WarehouseId)) ||
    /астана|astana/i.test(i.Warehouse ?? "");

  const results = await Promise.allSettled(
    sentinelArticles().map(async (art) => {
      const brands = await searchBrands(art);
      if (brands.IsError) throw new Error("brands_IsError");
      const b = (brands.Items ?? [])[0];
      if (!b) return 0; // API ответил, но бренда нет — это «ответил», не ошибка
      const prices = await searchPrices({
        article: b.Article,
        brand: b.Brand,
        warehouseIds: whIds.length ? whIds : undefined,
        includeAnalogs: true,
      });
      if (prices.IsError) throw new Error("prices_IsError");
      return (prices.Items ?? []).filter(
        (i) => (i.AvailableCount ?? 0) > 0 && (i.Price ?? 0) > 0 && isAstana(i)
      ).length;
    })
  );

  let offers = 0;
  let anyResponded = false;
  let lastErr: string | undefined;
  for (const r of results) {
    if (r.status === "fulfilled") {
      anyResponded = true;
      offers += r.value;
    } else {
      lastErr = (r.reason as Error)?.message?.slice(0, 200);
    }
  }

  const ok = offers > 0;
  const error = ok
    ? undefined
    : anyResponded
      ? "no_astana_stock"
      : lastErr ?? "all_failed";
  return store({ configured: true, ok, offers, error, ms: Date.now() - t0 });
}
