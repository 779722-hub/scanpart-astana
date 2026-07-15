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

/** Same part key — brand + article ignoring spaces, dashes and case. */
export function partKey(o: PartOffer): string {
  return `${o.brand}|${o.article}`.toUpperCase().replace(/[\s-]/g, "");
}

/**
 * Pick offers to show. The same part number (brand + article ignoring
 * spaces/dashes/case) is ONE part even across suppliers/warehouses — e.g.
 * "OC 90" and "OC90" — so it collapses to the single best offer (cheapest /
 * in-stock / fastest). Then up to `perSourceMax` DISTINCT parts are shown from
 * EACH warehouse so every pickup point (Р1/М2/Т3/Т4/Т5) stays represented.
 * Callers pass offers already filtered to Astana + in-stock.
 */
export function pickPerSource(offers: PartOffer[], perSourceMax: number): PartOffer[] {
  // 1) Collapse identical part numbers across everything, keep the best.
  const best = new Map<string, PartOffer>();
  for (const o of offers) {
    const k = partKey(o);
    const cur = best.get(k);
    if (!cur || sortForDisplay(o, cur) < 0) best.set(k, o);
  }
  // 2) Up to perSourceMax distinct parts from each warehouse. Group by the
  // warehouse code when present (Autotrade's Т3/Т4/Т5 are separate pickup
  // points); otherwise by supplier (Phaeton/Shate-M each map to one code).
  const bySource = new Map<string, PartOffer[]>();
  for (const o of best.values()) {
    const s = o.sourceCode || o.source || "phaeton";
    const list = bySource.get(s);
    if (list) list.push(o);
    else bySource.set(s, [o]);
  }
  const picked: PartOffer[] = [];
  for (const list of bySource.values()) {
    picked.push(...list.sort(sortForDisplay).slice(0, perSourceMax));
  }
  return picked.sort(sortForDisplay);
}
