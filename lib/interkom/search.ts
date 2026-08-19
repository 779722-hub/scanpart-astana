import * as cheerio from "cheerio";
import { applyMarkup } from "@/lib/markup";
import type { PartOffer } from "@/lib/phaeton/types";
import { authedPost, interkomConfigured, INTERKOM_SEGMENTS } from "./session";

const clean = (s: string) => s.toUpperCase().replace(/[\s-]/g, "");
const dash = (s: string) => (s.trim() === "-" ? "" : s.trim());

// Warehouse code for Interkom's single Astana pickup point (set up by the owner
// in admin «Склады» with address + coords). Order is fulfilment identity only.
const SOURCE_CODE = "И6";

/**
 * Map the customer's car make to Interkom brand-segment GUID(s). A segment is
 * MANDATORY on /opt/itemsSearch. When the make maps to a segment we query just
 * that one; when there is no make or it's unknown we query all segments.
 */
export function segmentsForMake(make?: string): string[] {
  const all = Object.values(INTERKOM_SEGMENTS);
  if (!make) return all;
  const m = make.trim().toLowerCase();
  if (/chevrolet|chevy|шевроле|daewoo|дэу|ravon|равон/.test(m)) return [INTERKOM_SEGMENTS.CHEVROLET];
  if (/hyundai|хендай|хёндай|хундай/.test(m)) return [INTERKOM_SEGMENTS.HYUNDAI];
  if (/\bkia\b|киа|кия/.test(m)) return [INTERKOM_SEGMENTS.KIA];
  if (/lada|ваз|жигул|нива|niva|priora|granta|vesta|калина|лада/.test(m)) return [INTERKOM_SEGMENTS.LADA];
  if (/renault|рено/.test(m)) return [INTERKOM_SEGMENTS.RENAULT];
  if (/камаз|kamaz/.test(m)) return [INTERKOM_SEGMENTS.KAMAZ];
  if (/\bgaz\b|газ|газель|gazel|волга|volga/.test(m)) return [INTERKOM_SEGMENTS.Gaz];
  if (
    /chery|geely|haval|changan|jac|byd|exeed|omoda|jetour|jaecoo|lifan|faw|great wall|gac|dongfeng|zeekr|tank|kaiyi|черри|джили|хавал|чанган|китай/.test(
      m
    )
  )
    return [INTERKOM_SEGMENTS["China Cars"]];
  return all;
}

/**
 * Segments to query. «Any car» free number search forces ALL brand segments
 * regardless of make (a part number from any brand catalog is found); otherwise
 * the make's own segment(s).
 */
export function segmentsToQuery(opts: { make?: string; allSegments?: boolean }): string[] {
  return opts.allSegments ? Object.values(INTERKOM_SEGMENTS) : segmentsForMake(opts.make);
}

/**
 * Parse an /opt/itemsSearch `data` HTML fragment into PartOffers, keeping ONLY
 * rows that are in stock («Доступен на складе» → icon `bi-patch-check
 * text-success`). Rows «нет на складе» (`bi-dash-circle text-danger`) and «в
 * пути» (`bi-custom-truck text-primary`) are excluded — there is no numeric qty.
 *
 * Exported for unit tests against a saved real fixture.
 */
export function parseInterkomRows(
  html: string,
  opts: { query: string; markupPct: number }
): PartOffer[] {
  // Wrap in <table> so the parser keeps the bare <tr> rows (a stray <tr> outside
  // a table context is otherwise dropped by the HTML tree builder).
  const $ = cheerio.load(`<table>${html}</table>`);
  const normQuery = clean(opts.query);
  const offers: PartOffer[] = [];
  const seen = new Set<string>();

  $("tr.min-h38px").each((_, tr) => {
    const tds = $(tr).children("td");
    if (tds.length < 7) return; // empty placeholder rows have a single colspan cell

    const code = tds.eq(0).text().trim();
    const article = dash(tds.eq(1).text());
    const oem = dash(tds.eq(2).text());

    // In-stock rule: keep only the green «available on stock» patch-check icon.
    const iconClass = tds.eq(3).find("i.bi").first().attr("class") ?? "";
    if (!iconClass.includes("text-success")) return;

    const brand = tds.eq(4).text().trim();
    const priceRaw = parseInt(tds.eq(6).text().replace(/[\s ]/g, ""), 10) || 0;
    if (priceRaw <= 0) return;

    // Prefer the part's own article; fall back to OEM, then the internal code.
    const art = article || oem || code;
    if (!art) return;

    // Name — robust, never blank. Some in-stock rows have no <a.GoodsInfo> text.
    // (1) the link text; (2) the name cell's own text with the stock icon/tooltip
    // stripped; (3) fall back to «brand article» (or just the article). Collapse
    // whitespace and drop stray leading/trailing dashes.
    const collapse = (s: string) =>
      s.replace(/\s+/g, " ").trim().replace(/^-+|-+$/g, "").trim();
    const nameCell = tds.eq(3).clone();
    nameCell.find("i, .tooltip").remove();
    const name =
      tds.eq(3).find("a.GoodsInfo").first().text().trim() ||
      collapse(nameCell.text()) ||
      collapse(`${brand} ${art}`) ||
      art;
    if (!name) return;

    const key = `${brand}|${clean(art)}`;
    if (seen.has(key)) return;
    seen.add(key);

    offers.push({
      // Opaque id — must NOT name the supplier (leaks to client JSON).
      id: `и6:${clean(art)}:${brand}`,
      brand,
      article: art,
      name,
      priceRaw,
      priceFinal: applyMarkup(priceRaw, opts.markupPct),
      quantity: 1, // in stock; supplier exposes no numeric quantity
      // Raw label only — the coded source label is applied centrally in /api/search.
      warehouse: "Астана",
      isOriginal: clean(art) === normQuery || clean(oem) === normQuery,
      compat: "unknown",
      atAstana: true,
      inStockNow: true,
      matchesAllWords: true,
      shipmentDays: 0,
      source: "interkom",
      sourceCode: SOURCE_CODE,
    });
  });

  return offers;
}

/**
 * Search Interkom by article/OEM and return in-stock Astana offers. Determines
 * the brand-segment(s) from the customer's car make (all segments when unknown),
 * queries them in parallel, parses + filters to in-stock, and dedups by
 * article+brand. Fail-safe: callers wrap in try/catch.
 */
export async function searchInterkomOffers(
  query: string,
  opts: { markupPct: number; make?: string; allSegments?: boolean }
): Promise<PartOffer[]> {
  if (!interkomConfigured()) return [];
  // The endpoint requires a search term of at least 4 characters.
  if (query.trim().length < 4) return [];

  const segments = segmentsToQuery(opts);
  const responses = await Promise.allSettled(
    segments.map((segment) => {
      const body = `search=${encodeURIComponent(query)}&segment=${segment}`;
      return authedPost("/opt/itemsSearch", body);
    })
  );

  const merged: PartOffer[] = [];
  const seen = new Set<string>();
  for (const r of responses) {
    if (r.status !== "fulfilled" || r.value.status !== 200) continue;
    let data = "";
    try {
      data = (JSON.parse(r.value.body) as { data?: string }).data ?? "";
    } catch {
      continue;
    }
    for (const o of parseInterkomRows(data, { query, markupPct: opts.markupPct })) {
      const key = `${o.brand}|${clean(o.article)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(o);
    }
  }
  return merged;
}
