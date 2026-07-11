import { test } from "node:test";
import assert from "node:assert/strict";
import { pickPerSource, sortForDisplay } from "../lib/search/pick";
import type { PartOffer } from "../lib/phaeton/types";

let seq = 0;
const offer = (over: Partial<PartOffer>): PartOffer => ({
  id: `o${seq++}`,
  brand: "BRAND",
  article: "ART",
  name: "part",
  priceRaw: 100,
  priceFinal: 100,
  quantity: 1,
  isOriginal: false,
  atAstana: true,
  inStockNow: true,
  matchesAllWords: true,
  shipmentDays: 0,
  ...over,
});

const bySrc = (offers: PartOffer[]) => {
  const m: Record<string, number> = {};
  for (const o of offers) m[o.source ?? "phaeton"] = (m[o.source ?? "phaeton"] ?? 0) + 1;
  return m;
};

test("up to N offers from EACH source", () => {
  const offers = [
    ...[1, 2, 3, 4, 5].map((i) => offer({ source: "phaeton", article: `P${i}`, priceFinal: i })),
    ...[1, 2, 3, 4].map((i) => offer({ source: "shatem", article: `S${i}`, priceFinal: i })),
  ];
  const picked = pickPerSource(offers, 3);
  assert.deepEqual(bySrc(picked), { phaeton: 3, shatem: 3 });
});

test("dedup WITHIN a source by brand+article (keep cheaper)", () => {
  const offers = [
    offer({ source: "shatem", brand: "TRW", article: "GDB1", priceFinal: 5000 }),
    offer({ source: "shatem", brand: "TRW", article: "GDB1", priceFinal: 4200 }), // same part, other warehouse
  ];
  const picked = pickPerSource(offers, 3);
  assert.equal(picked.length, 1);
  assert.equal(picked[0].priceFinal, 4200);
});

test("SAME part from two different sources is kept (one per source)", () => {
  const offers = [
    offer({ source: "phaeton", brand: "BLUEPRINT", article: "ADN1", priceFinal: 999 }),
    offer({ source: "shatem", brand: "BLUEPRINT", article: "ADN1", priceFinal: 1100 }),
  ];
  const picked = pickPerSource(offers, 3);
  assert.equal(picked.length, 2);
  assert.deepEqual(bySrc(picked), { phaeton: 1, shatem: 1 });
});

test("normalizes brand+article (spaces/dashes/case) when deduping", () => {
  const offers = [
    offer({ source: "phaeton", brand: "Mahle", article: "OC 90", priceFinal: 2500 }),
    offer({ source: "phaeton", brand: "MAHLE", article: "OC-90", priceFinal: 2200 }),
  ];
  assert.equal(pickPerSource(offers, 3).length, 1);
});

test("sortForDisplay: original first, then cheaper", () => {
  const a = offer({ isOriginal: true, priceFinal: 9000 });
  const b = offer({ isOriginal: false, priceFinal: 100 });
  assert.ok(sortForDisplay(a, b) < 0); // original before cheaper analog
  const c = offer({ isOriginal: false, priceFinal: 500 });
  const d = offer({ isOriginal: false, priceFinal: 800 });
  assert.ok(sortForDisplay(c, d) < 0); // cheaper first among analogs
});

test("empty input → empty output", () => {
  assert.deepEqual(pickPerSource([], 3), []);
});
