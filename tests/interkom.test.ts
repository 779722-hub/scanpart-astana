import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { parseInterkomRows, segmentsForMake, segmentsToQuery } from "../lib/interkom/search";
import { INTERKOM_SEGMENTS } from "../lib/interkom/session";

// Real /opt/itemsSearch `data` fragment captured from opt.interkom.kz
// (segment=CHEVROLET, search=96350). Contains all three availability icon
// states: 26 «available» (text-success), 10 «нет на складе» (text-danger),
// 2 «в пути» (text-primary/custom-truck).
const FIXTURE = fs.readFileSync(
  path.join(__dirname, "fixtures", "interkom-itemsSearch-96350.html"),
  "utf8"
);

const parse = () => parseInterkomRows(FIXTURE, { query: "96350", markupPct: 35 });

test("interkom: in-stock filter keeps only text-success rows", () => {
  const offers = parse();
  // 26 green «Доступен на складе» rows; danger/truck rows dropped.
  assert.equal(offers.length, 26);
});

test("interkom: excludes «нет на складе» and «в пути» rows", () => {
  const offers = parse();
  // A known «в пути» (truck) part must NOT appear.
  assert.ok(
    !offers.some((o) => o.name.includes("Катушка зажигания Nexia 1-2 1.5 16V Ossca")),
    "truck (в пути) row must be excluded"
  );
});

test("interkom: parses row fields (article, oem fallback, name, brand)", () => {
  const offers = parse();
  // Row with a real Артикул + brand.
  const articled = offers.find((o) => o.article === "96350078-WSM");
  assert.ok(articled, "articled row present");
  assert.equal(articled!.brand, "New Weismo");

  // Row whose Артикул is «-» → article falls back to the OEM number.
  const gm = offers.find((o) => o.name.includes("Бензонасос в сборе Nexia 1-2 GM"));
  assert.ok(gm, "GM benzonasos row present");
  assert.equal(gm!.article, "96180483"); // OEM fallback (td1 was «-»)
  assert.equal(gm!.brand, "GM");
});

test("interkom: parses price with space thousands separator (50 353 → 50353)", () => {
  const offers = parse();
  const gm = offers.find((o) => o.name.includes("Бензонасос в сборе Nexia 1-2 GM"));
  assert.equal(gm!.priceRaw, 50353);
  assert.equal(gm!.priceFinal, Math.round(50353 * 1.35)); // markup 35%
});

test("interkom: normalizes to PartOffer (source/code/warehouse/flags)", () => {
  const offers = parse();
  for (const o of offers) {
    assert.equal(o.source, "interkom");
    assert.equal(o.sourceCode, "И6"); // exposes only the opaque code, never the name
    assert.equal(o.warehouse, "Астана");
    assert.equal(o.atAstana, true);
    assert.equal(o.inStockNow, true);
    assert.ok(o.quantity >= 1);
    // The opaque id must NOT leak the supplier name.
    assert.ok(!/interkom/i.test(o.id));
  }
});

test("interkom: make → segment mapping", () => {
  // Known makes → their single segment GUID.
  assert.deepEqual(segmentsForMake("Chevrolet"), [INTERKOM_SEGMENTS.CHEVROLET]);
  assert.deepEqual(segmentsForMake("Daewoo"), [INTERKOM_SEGMENTS.CHEVROLET]); // Nexia etc.
  assert.deepEqual(segmentsForMake("Hyundai"), [INTERKOM_SEGMENTS.HYUNDAI]);
  assert.deepEqual(segmentsForMake("KIA"), [INTERKOM_SEGMENTS.KIA]);
  assert.deepEqual(segmentsForMake("ВАЗ"), [INTERKOM_SEGMENTS.LADA]);
  assert.deepEqual(segmentsForMake("Renault"), [INTERKOM_SEGMENTS.RENAULT]);
  assert.deepEqual(segmentsForMake("КамАЗ"), [INTERKOM_SEGMENTS.KAMAZ]);
  assert.deepEqual(segmentsForMake("Газель"), [INTERKOM_SEGMENTS.Gaz]);
  assert.deepEqual(segmentsForMake("Chery"), [INTERKOM_SEGMENTS["China Cars"]]);
  // Unknown / no make → query all 8 segments.
  assert.equal(segmentsForMake("Toyota").length, 8);
  assert.equal(segmentsForMake(undefined).length, 8);
});

test("interkom: allSegments (anycar) forces all 8 segments regardless of make", () => {
  const all = Object.values(INTERKOM_SEGMENTS);
  // «Any car» ON with a NON-matching car set (Chevrolet) must still query all
  // segments — a Chevrolet number would otherwise miss other brands' catalogs.
  assert.deepEqual(segmentsToQuery({ make: "Chevrolet", allSegments: true }), all);
  // No make + allSegments → all.
  assert.deepEqual(segmentsToQuery({ allSegments: true }), all);
  // Default (checkbox OFF) is unchanged: scoped to the make's own segment.
  assert.deepEqual(segmentsToQuery({ make: "Chevrolet" }), [INTERKOM_SEGMENTS.CHEVROLET]);
  assert.deepEqual(segmentsToQuery({ make: "Chevrolet", allSegments: false }), [
    INTERKOM_SEGMENTS.CHEVROLET,
  ]);
});
