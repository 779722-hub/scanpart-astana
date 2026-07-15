import { test } from "node:test";
import assert from "node:assert/strict";
import {
  slugifyId,
  parseCoord,
  parseLatLngPair,
  parseMarkup,
  validateWarehouse,
  hasCoords,
  PICKUP_MINUTES_DEFAULT,
} from "../lib/delivery/warehouse";

test("parseMarkup: empty → null, clamps, comma decimals", () => {
  assert.equal(parseMarkup(""), null);
  assert.equal(parseMarkup(null), null);
  assert.equal(parseMarkup("abc"), null);
  assert.equal(parseMarkup("30"), 30);
  assert.equal(parseMarkup("30,5"), 31); // rounded
  assert.equal(parseMarkup(5), 10); // clamped to min
  assert.equal(parseMarkup(999), 200); // clamped to max
});

test("validateWarehouse: markup optional (null) and clamped when set", () => {
  const a = validateWarehouse({ name: "W" });
  if (a.ok) assert.equal(a.warehouse.markup, null);
  const b = validateWarehouse({ name: "W", markup: "40" });
  if (b.ok) assert.equal(b.warehouse.markup, 40);
});

test("parseCoord: comma decimals, blanks, invalid", () => {
  assert.equal(parseCoord("51,1605"), 51.1605);
  assert.equal(parseCoord("71.4704"), 71.4704);
  assert.equal(parseCoord(""), null);
  assert.equal(parseCoord(null), null);
  assert.equal(parseCoord("abc"), null);
  assert.equal(parseCoord(51.5), 51.5);
});

test("parseLatLngPair: splits a pasted map pair (dot decimals)", () => {
  assert.deepEqual(parseLatLngPair("51.1605, 71.4704"), { lat: 51.1605, lng: 71.4704 });
  assert.deepEqual(parseLatLngPair("51.1605 71.4704"), { lat: 51.1605, lng: 71.4704 });
  assert.deepEqual(parseLatLngPair("nope"), { lat: null, lng: null });
});

test("slugifyId: lowercases and dashes", () => {
  assert.equal(slugifyId("Central Astana"), "central-astana");
  assert.equal(slugifyId("  Склад #1  "), "склад-1");
});

test("validateWarehouse: requires a name", () => {
  const r = validateWarehouse({ name: " " });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.error, "name_required");
});

test("validateWarehouse: rejects out-of-range coords", () => {
  assert.equal(validateWarehouse({ name: "W", lat: 200, lng: 10 }).ok, false);
  assert.equal(validateWarehouse({ name: "W", lat: 10, lng: 999 }).ok, false);
});

test("validateWarehouse: clamps pickup minutes, defaults, builds id", () => {
  const r = validateWarehouse({ name: "Central", lat: "51,16", lng: "71,47", pickupMinutes: "9999" });
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.warehouse.pickupMinutes, 240); // clamped
    assert.equal(r.warehouse.lat, 51.16);
    assert.equal(r.warehouse.id, "central");
    assert.equal(r.warehouse.active, true);
    assert.equal(hasCoords(r.warehouse), true);
  }
});

test("validateWarehouse: missing minutes → default; no coords → hasCoords false", () => {
  const r = validateWarehouse({ name: "No Geo" });
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.warehouse.pickupMinutes, PICKUP_MINUTES_DEFAULT);
    assert.equal(hasCoords(r.warehouse), false);
  }
});
