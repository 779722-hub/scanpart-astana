import type { PartOffer } from "@/lib/phaeton/types";

/** Display order: exact part first, then compat, then faster, then cheaper. */
export function sortForDisplay(a: PartOffer, b: PartOffer): number {
  const oa = a.isOriginal ? 0 : 1;
  const ob = b.isOriginal ? 0 : 1;
  if (oa !== ob) return oa - ob;
  const cm = (a.compat === "match" ? 0 : 1) - (b.compat === "match" ? 0 : 1);
  if (cm !== 0) return cm;
  if (a.shipmentDays !== b.shipmentDays) return a.shipmentDays - b.shipmentDays;
  return a.priceFinal - b.priceFinal;
}

/**
 * Up to `perSourceMax` offers from EACH supplier (source), deduped within a
 * supplier by brand+article (the same part in two of that supplier's Astana
 * warehouses shows once — the best one). Callers pass offers already filtered
 * to Astana + in-stock. "по 3 позиции с каждого склада".
 */
export function pickPerSource(offers: PartOffer[], perSourceMax: number): PartOffer[] {
  const bySource = new Map<string, PartOffer[]>();
  for (const o of offers) {
    const s = o.source ?? "phaeton";
    const list = bySource.get(s);
    if (list) list.push(o);
    else bySource.set(s, [o]);
  }
  const picked: PartOffer[] = [];
  for (const list of bySource.values()) {
    const best = new Map<string, PartOffer>();
    for (const o of list) {
      const k = `${o.brand}|${o.article}`.toUpperCase().replace(/[\s-]/g, "");
      const cur = best.get(k);
      if (!cur || sortForDisplay(o, cur) < 0) best.set(k, o);
    }
    picked.push(...[...best.values()].sort(sortForDisplay).slice(0, perSourceMax));
  }
  return picked.sort(sortForDisplay);
}
