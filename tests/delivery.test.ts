import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeCode, isValidCode, codesMatch } from "../lib/delivery/handover";
import { canTransition } from "../lib/delivery/types";
import { haversineKm, buildRoute } from "../lib/delivery/route";

test("handover code: normalize / validate / match", () => {
  assert.equal(normalizeCode("12-34"), "1234");
  assert.equal(normalizeCode("code 5 6 7 8 9"), "5678");
  assert.equal(isValidCode("1234"), true);
  assert.equal(isValidCode("123"), false);
  assert.equal(codesMatch("1234", "12 34"), true);
  assert.equal(codesMatch("1234", "1235"), false);
  assert.equal(codesMatch("12", "12"), false); // not 4 digits
});

test("status transitions: only forward moves allowed", () => {
  assert.equal(canTransition("new", "assigned"), true);
  assert.equal(canTransition("assigned", "picking"), true);
  assert.equal(canTransition("en_route", "delivered"), true);
  assert.equal(canTransition("new", "delivered"), false); // can't skip
  assert.equal(canTransition("delivered", "en_route"), false); // terminal
  assert.equal(canTransition("picking", "canceled"), true);
});

test("haversineKm: ~111km per degree of longitude at equator", () => {
  const km = haversineKm({ lat: 0, lng: 0 }, { lat: 0, lng: 1 });
  assert.ok(Math.abs(km - 111.19) < 0.5, `got ${km}`);
});

test("buildRoute: pickups before dropoffs, nearest-neighbour, ETA, skipped", () => {
  const warehouses = [
    { id: "a", name: "WH A", lat: 51.11, lng: 71.41, pickupMinutes: 10 },
    { id: "b", name: "WH B", lat: 51.2, lng: 71.5, pickupMinutes: 15 },
  ];
  const deliveries = [
    { id: "d1", label: "Client 1", lat: 51.12, lng: 71.42, warehouseIds: ["a"] },
    { id: "d2", label: "Client 2", lat: 51.19, lng: 71.49, warehouseIds: ["b"] },
    { id: "d3", label: "No geo", lat: null, lng: null, warehouseIds: ["a"] },
  ];
  const r = buildRoute(deliveries, warehouses, {
    start: { lat: 51.1, lng: 71.4 },
    avgSpeedKmh: 24,
    dropoffMinutes: 5,
  });

  // Order: nearest pickups from start (a, then b), then nearest dropoffs from b (d2, then d1).
  assert.deepEqual(r.stops.map((s) => s.refId), ["a", "b", "d2", "d1"]);
  assert.deepEqual(
    r.stops.map((s) => s.kind),
    ["pickup", "pickup", "dropoff", "dropoff"]
  );
  assert.deepEqual(r.skipped, ["d3"]); // dropped for missing coords

  // ETA strictly increases along the route.
  for (let i = 1; i < r.stops.length; i++) {
    assert.ok(r.stops[i].etaMinutes >= r.stops[i - 1].etaMinutes, "eta monotonic");
  }
  assert.ok(r.totalKm > 0 && r.totalMinutes > 0);
});

test("buildRoute: empty deliveries → empty route", () => {
  const r = buildRoute([], [], {});
  assert.deepEqual(r.stops, []);
  assert.equal(r.totalKm, 0);
});
