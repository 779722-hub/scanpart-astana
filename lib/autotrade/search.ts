import { applyMarkup } from "@/lib/markup";
import type { PartOffer } from "@/lib/phaeton/types";
import { autotradeApi, autotradeConfigured, ASTANA_STORAGE_IDS } from "./session";

const clean = (s: string) => s.toUpperCase().replace(/[\s-]/g, "");

// Each Astana warehouse is a distinct pickup point with its own source code
// (set up in admin «Склады» with address + coords). Order = fulfilment priority:
// main (Пушкина/Т3) first, then Айнакол/Т4, then Тлендиева/Т5.
const STORAGE_CODES: Record<string, string> = {
  "168102": "Т3", // Астана (Пушкина) — основной
  "247102": "Т4", // Астана (Айнакол)
  "262102": "Т5", // Астана (Тлендиева)
};

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
    cross: 1, // кроссы/аналоги (той же детали)
    replace: 1, // замены
    bycross: 0,
    related: 0, // НЕ сопутствующие товары (смазки, монтажные комплекты)
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

    // Fulfil from ONE Astana warehouse — prefer the main (Т3), then Т4, then Т5 —
    // and carry that warehouse's own code so pickup routing (address + coords set
    // up in admin «Склады») matches where the stock actually is.
    let code = "";
    let qty = 0;
    for (const id of ASTANA_STORAGE_IDS) {
      const w = info.stocks?.[String(id)];
      const n = (Number(w?.quantity_unpacked) || 0) + (Number(w?.quantity_packed) || 0);
      if (n > 0) {
        code = STORAGE_CODES[String(id)] ?? "";
        qty = n;
        break;
      }
    }
    if (qty <= 0 || !code) continue;

    const key = `${it.brand_name}|${art}`;
    if (seen.has(key)) continue;
    seen.add(key);

    offers.push({
      // Opaque id — must NOT name the supplier (leaks to client JSON).
      id: `${code.toLowerCase()}:${art}:${it.brand_name}`,
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
      // Per-warehouse code (Т3/Т4/Т5) — overrides the source default in /api/search.
      sourceCode: code,
    });
  }
  return offers;
}
