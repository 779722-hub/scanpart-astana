/**
 * Shared courier route plan so the courier app and the admin panel show the
 * SAME thing: one order at a time, routed from the courier's current position
 * to the order's warehouse pickup(s) and then the customer — identical stops,
 * distance and time in both places.
 */
import { buildRoute, type RouteWarehouse, type BuiltRoute, type LatLng } from "./route";
import { roadPath } from "./roadroute";
import type { Delivery } from "./types";

export type RoutePlan = BuiltRoute & { geometry: [number, number][] | null };

export interface CourierPlan {
  route: RoutePlan;
  current: Delivery | null;
  sorted: Delivery[]; // active deliveries in the order they should be done
}

const STATUS_RANK: Record<string, number> = { en_route: 0, picking: 1, accepted: 2, assigned: 3 };

/**
 * @param active   the courier's active deliveries (assigned/picking/en_route)
 * @param warehouses route warehouses (with coords + pickup minutes)
 * @param start    the courier's current position (null → route starts at the first stop)
 */
export async function buildCourierPlan(
  active: Delivery[],
  warehouses: RouteWarehouse[],
  start: LatLng | null
): Promise<CourierPlan> {
  const toRD = (d: Delivery) => ({
    id: d.id,
    label: d.customerName || d.address,
    lat: d.lat,
    lng: d.lng,
    warehouseIds: d.warehouseIds,
  });

  // Optimal order of the orders (which to do first), by the sequence their
  // dropoffs appear in the full optimal route from the courier's position.
  const globalRoute = buildRoute(active.map(toRD), warehouses, { start });
  const dropSeq = globalRoute.stops.filter((s) => s.kind === "dropoff").map((s) => s.refId);
  const orderIdx = (id: string) => {
    const i = dropSeq.indexOf(id);
    return i === -1 ? 999 : i;
  };
  const sorted = [...active].sort(
    (a, b) =>
      (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9) ||
      orderIdx(a.id) - orderIdx(b.id) ||
      a.createdAt.localeCompare(b.createdAt)
  );
  const current = sorted[0] ?? null;

  let route: RoutePlan = { stops: [], totalKm: 0, totalMinutes: 0, skipped: [], geometry: null };
  if (current) {
    const r = buildRoute([toRD(current)], warehouses, { start });
    const stopCoords = r.stops.map((s) => ({ lat: s.lat, lng: s.lng }));
    const pts = start ? [start, ...stopCoords] : stopCoords;
    const road = pts.length >= 2 ? await roadPath(pts) : null;
    route = { ...r, geometry: road?.geometry ?? null };

    // Overlay real road distance/time when the legs line up with the stops.
    if (road && start && road.legs.length === r.stops.length) {
      const whMin = new Map(warehouses.map((w) => [w.id, w.pickupMinutes]));
      let clock = 0;
      const stops = r.stops.map((s, i) => {
        clock += road.legs[i].min;
        const etaMinutes = Math.round(clock);
        clock += s.kind === "pickup" ? whMin.get(s.refId) ?? 0 : 5;
        return { ...s, legKm: road.legs[i].km, etaMinutes };
      });
      route = { ...route, stops, totalKm: road.totalKm, totalMinutes: Math.round(clock) };
    }
  }

  return { route, current, sorted };
}
