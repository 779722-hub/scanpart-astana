import { searchArticles, searchPricesWithArticleInfo, getContext } from "./client";
import { getAstanaLocationCodes } from "./astana";
import { applyMarkup } from "@/lib/markup";
import type { PartOffer } from "@/lib/phaeton/types";
import type { ShatemPriceItem } from "./types";

/** shippingDateTime → whole days from now (0 when today or past). */
function shipmentDays(iso?: string): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t) || t <= Date.now()) return 0;
  return Math.ceil((t - Date.now()) / (1000 * 60 * 60 * 24));
}

const clean = (s: string) => s.toUpperCase().replace(/[\s-]/g, "");

/**
 * Search Shate-M by article code and return offers already normalized to
 * PartOffer and filtered to Astana warehouses that are in stock.
 *
 * Fail-safe by contract: callers should still wrap in try/catch, but this
 * throws only on hard client/auth errors — an empty catalog returns [].
 */
export async function searchShatemOffers(
  query: string,
  opts: { markupPct: number }
): Promise<PartOffer[]> {
  const [hits, ctx, astanaCodes] = await Promise.all([
    searchArticles(query),
    getContext(),
    getAstanaLocationCodes().catch(() => [] as string[]),
  ]);
  if (!hits.length) return [];

  const groups = await searchPricesWithArticleInfo(
    hits.map((h) => ({
      articleId: h.article.id,
      agreementCode: ctx.agreementCode,
      deliveryAddressCode: ctx.deliveryAddressCode,
      includeAnalogs: true,
    }))
  );

  const normQuery = clean(query);
  const isAstana = (p: ShatemPriceItem): boolean =>
    /астана|astana/i.test(p.addInfo?.city ?? "") ||
    (!!p.locationCode && astanaCodes.includes(p.locationCode));

  const offers: PartOffer[] = [];
  const seen = new Set<string>();
  for (const g of groups) {
    const brand = g.article.tradeMarkName ?? "";
    const code = g.article.code ?? "";
    const name = g.article.name ?? "";
    for (const p of g.prices ?? []) {
      if ((p.quantity?.available ?? 0) <= 0) continue;
      if (!isAstana(p)) continue;
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      const days = shipmentDays(p.shippingDateTime);
      offers.push({
        id: `shatem:${p.id}`,
        brand,
        article: code,
        name,
        priceRaw: p.price.value,
        priceFinal: applyMarkup(p.price.value, opts.markupPct),
        quantity: p.quantity.available,
        // Raw city only — the coded source label is applied centrally in /api/search.
        warehouse: p.addInfo?.city ?? p.locationCode,
        isOriginal: clean(code) === normQuery,
        compat: "unknown",
        atAstana: true,
        inStockNow: days === 0,
        matchesAllWords: true,
        shipmentDays: days,
        source: "shatem",
      });
    }
  }
  return offers;
}
