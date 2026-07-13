import { test } from "node:test";
import assert from "node:assert/strict";
import { optimizeRoute, OptResult, OptWarehouse, OptDelivery } from "../lib/delivery/optimize";

/** Every dropoff must appear after all its required (present) pickups. */
function precedenceHolds(r: OptResult, deliveries: OptDelivery[], warehouses: OptWarehouse[]): boolean {
  const whIds = new Set(warehouses.map((w) => w.id));
  const pos = new Map<string, number>();
  r.order.forEach((s, i) => pos.set(`${s.kind}:${s.refId}`, i));
  for (const d of deliveries) {
    const di = pos.get(`dropoff:${d.id}`);
    if (di === undefined) continue;
    for (const wid of d.warehouseIds) {
      if (!whIds.has(wid)) continue; // ignored: never became a pickup node
      const pi = pos.get(`pickup:${wid}`);
      if (pi === undefined || pi > di) return false;
    }
  }
  return true;
}

test("optimizeRoute: interleaving beats pickups-first", () => {
  // Linear layout along lng (lat=0): start(0), w1(1), A(2), w2(5), B(6).
  // Pickups-first (w1,w2,then drops) ≈ 10km; interleaved (w1,A,w2,B) = 6km.
  const warehouses = [
    { id: "w1", lat: 0, lng: 1 },
    { id: "w2", lat: 0, lng: 5 },
  ];
  const deliveries = [
    { id: "A", lat: 0, lng: 2, warehouseIds: ["w1"] },
    { id: "B", lat: 0, lng: 6, warehouseIds: ["w2"] },
  ];
  const r = optimizeRoute({ lat: 0, lng: 0 }, deliveries, warehouses);

  assert.deepEqual(r.order.map((s) => `${s.kind}:${s.refId}`), [
    "pickup:w1",
    "dropoff:A",
    "pickup:w2",
    "dropoff:B",
  ]);

  // A dropoff appears before some later pickup → the route interleaves.
  const firstDrop = r.order.findIndex((s) => s.kind === "dropoff");
  const lastPickup = r.order.map((s) => s.kind).lastIndexOf("pickup");
  assert.ok(firstDrop < lastPickup, "dropoff should precede a later pickup");

  assert.ok(precedenceHolds(r, deliveries, warehouses));
});

test("optimizeRoute: precedence always holds (multi-warehouse delivery)", () => {
  const warehouses = [
    { id: "w1", lat: 0, lng: 1 },
    { id: "w2", lat: 0, lng: 4 },
    { id: "w3", lat: 0, lng: 8 },
  ];
  const deliveries = [
    { id: "A", lat: 0, lng: 2, warehouseIds: ["w1", "w3"] },
    { id: "B", lat: 0, lng: 5, warehouseIds: ["w2"] },
  ];
  const r = optimizeRoute({ lat: 0, lng: 0 }, deliveries, warehouses);
  assert.ok(precedenceHolds(r, deliveries, warehouses));
});

test("optimizeRoute: shared warehouse visited once", () => {
  const warehouses = [{ id: "w1", lat: 0, lng: 1 }];
  const deliveries = [
    { id: "A", lat: 0, lng: 2, warehouseIds: ["w1"] },
    { id: "B", lat: 0, lng: 3, warehouseIds: ["w1"] },
  ];
  const r = optimizeRoute({ lat: 0, lng: 0 }, deliveries, warehouses);
  const w1Pickups = r.order.filter((s) => s.kind === "pickup" && s.refId === "w1");
  assert.equal(w1Pickups.length, 1);
  assert.ok(precedenceHolds(r, deliveries, warehouses));
});

test("optimizeRoute: non-finite coords → skipped, absent from order", () => {
  const warehouses = [{ id: "w1", lat: 0, lng: 1 }];
  const deliveries = [
    { id: "A", lat: 0, lng: 2, warehouseIds: ["w1"] },
    { id: "bad", lat: NaN, lng: 2, warehouseIds: ["w1"] },
  ];
  const r = optimizeRoute(null, deliveries, warehouses);
  assert.deepEqual(r.skipped, ["bad"]);
  assert.ok(!r.order.some((s) => s.refId === "bad"));
});

test("optimizeRoute: empty deliveries → empty result", () => {
  const r = optimizeRoute(null, [], []);
  assert.deepEqual(r, { order: [], totalKm: 0, skipped: [] });
});
