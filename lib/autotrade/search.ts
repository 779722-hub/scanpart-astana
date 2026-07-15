import { applyMarkup } from "@/lib/markup";
import type { PartOffer } from "@/lib/phaeton/types";
import { autotradeApi, autotradeConfigured, ASTANA_STORAGE_IDS } from "./session";

const clean = (s: string) => s.toUpperCase().replace(/[\s-]/g, "");

interface QueryItem {
  article: string;
  brand_name: string;
  name?: string;
  original_name?: string;
  part_type?: string;
}

interface StockRow {
  quantity_unpacked?: number;
  quantity_packed?: number;
  name?: string;
}
interface StockInfo {
  brand?: string;
  price?: number;
  currency?: string;
  stocks?: Record<string, StockRow>;
}

/**
 * Search Autotrade (sklad.autotrade.kz) by article via its JSON API and return
 * PartOffer[] normalized to Astana warehouses that are in stock.
 *
 * Two calls: getItemsByQuery (original + crosses/analogs, related=1) then
 * getStocksAndPrices scoped to the 3 Astana storages. Fail-safe by contract:
 * callers wrap in try/catch; an empty/blocked result returns [].
 */
export async function searchAutotradeOffers(
  query: string,
  opts: { markupPct: number }
): Promise<PartOffer[]> {
  if (!autotradeConfigured()) return [];

  const q = await autotradeApi("getItemsByQuery", {
    q: query,
    brand: "",
    mode: 1,
    strict: 1,
    page: 1,
    limit: 50,
    related: 1,
  });
  const items = (q.items as QueryItem[] | undefined) ?? [];
  if (!items.length) return [];

  // The stocks endpoint wants a nested map { article: { brand: qty } }.
  const map: Record<string, Record<string, number>> = {};
  for (const it of items) {
    const art = String(it.article);
    (map[art] ||= {})[it.brand_name] = 1;
  }

  const sp = await autotradeApi("getStocksAndPrices", {
    items: map,
    storages: ASTANA_STORAGE_IDS,
    strict: 1,
  });
  if (Number(sp.code) !== 0) return [];
  const stocks = (sp.items as Record<string, StockInfo> | undefined) ?? {};

  const normQuery = clean(query);
  const offers: PartOffer[] = [];
  const seen = new Set<string>();
  for (const it of items) {
    const art = String(it.article);
    const info = stocks[art];
    // Response is keyed by article; skip when the priced brand doesn't match.
    if (!info || (info.brand && info.brand !== it.brand_name)) continue;
    const price = Number(info.price) || 0;
    if (price <= 0) continue;

    let qty = 0;
    for (const id of ASTANA_STORAGE_IDS) {
      const w = info.stocks?.[String(id)];
      qty += (Number(w?.quantity_unpacked) || 0) + (Number(w?.quantity_packed) || 0);
    }
    if (qty <= 0) continue;

    const key = `${it.brand_name}|${art}`;
    if (seen.has(key)) continue;
    seen.add(key);

    offers.push({
      // Opaque id — must NOT name the supplier (leaks to client JSON).
      id: `t3:${art}:${it.brand_name}`,
      brand: it.brand_name,
      article: art,
      name: it.name || it.original_name || it.part_type || "",
      priceRaw: price,
      priceFinal: applyMarkup(price, opts.markupPct),
      quantity: qty,
      // Raw label only — the coded source label is applied centrally in /api/search.
      warehouse: "Астана",
      isOriginal: clean(art) === normQuery,
      compat: "unknown",
      atAstana: true,
      inStockNow: true,
      matchesAllWords: true,
      shipmentDays: 0,
      source: "autotrade",
    });
  }
  return offers;
}
