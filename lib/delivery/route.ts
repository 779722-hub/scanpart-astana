/**
 * Delivery route builder (pure, deterministic → unit-testable).
 *
 * Strategy for a courier run: collect from every needed warehouse first
 * (pickups), then deliver to customers (dropoffs), each leg ordered by
 * nearest-neighbour. ETA is cumulative travel time (distance ÷ average city
 * speed) plus per-stop service time (warehouse pickup minutes, dropoff minutes).
 *
 * Travel time here uses straight-line (Haversine) distance — a solid default.
 * When a 2GIS Distance-Matrix key is configured, the caller can override the
 * leg distances/durations; the ordering + accumulation logic stays the same.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

export interface RouteDelivery {
  id: string;
  label: string;
  lat: number | null;
  lng: number | null;
  warehouseIds: string[];
}

export interface RouteWarehouse {
  id: string;
  name: string;
  lat: number | null;
  lng: number | null;
  pickupMinutes: number;
}

export interface RouteStop {
  kind: "pickup" | "dropoff";
  refId: string;
  label: string;
  lat: number;
  lng: number;
  legKm: number; // distance from the previous stop
  etaMinutes: number; // cumulative minutes from the run start to ARRIVAL here
}

export interface BuiltRoute {
  stops: RouteStop[];
  totalKm: number;
  totalMinutes: number; // arrival at the last stop + its service time
  skipped: string[]; // delivery ids dropped for missing coordinates
}

export interface BuildRouteOptions {
  start?: LatLng | null; // courier location; falls back to the first pickup
  avgSpeedKmh?: number; // default 24 (city)
  dropoffMinutes?: number; // service time per customer, default 5
}

const R = 6371; // km
export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

interface Node {
  id: string;
  label: string;
  lat: number;
  lng: number;
  kind: "pickup" | "dropoff";
  service: number; // minutes at this node
}

/** Order nodes greedily by nearest-neighbour from `from`. Deterministic. */
function nearestOrder(from: LatLng, nodes: Node[]): Node[] {
  const remaining = [...nodes];
  const out: Node[] = [];
  let cur = from;
  while (remaining.length) {
    let best = 0;
    let bestKm = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const km = haversineKm(cur, remaining[i]);
      if (km < bestKm - 1e-9) {
        bestKm = km;
        best = i;
      }
    }
    const [n] = remaining.splice(best, 1);
    out.push(n);
    cur = n;
  }
  return out;
}

export function buildRoute(
  deliveries: RouteDelivery[],
  warehouses: RouteWarehouse[],
  opts: BuildRouteOptions = {}
): BuiltRoute {
  const avgSpeed = opts.avgSpeedKmh ?? 24;
  const dropoffMin = opts.dropoffMinutes ?? 5;

  const withCoords = deliveries.filter(
    (d): d is RouteDelivery & { lat: number; lng: number } =>
      d.lat !== null && d.lng !== null
  );
  const skipped = deliveries.filter((d) => d.lat === null || d.lng === null).map((d) => d.id);

  // Needed pickup warehouses (union), with coordinates.
  const neededIds = new Set<string>();
  for (const d of withCoords) for (const w of d.warehouseIds) neededIds.add(w);
  const whById = new Map(warehouses.map((w) => [w.id, w]));
  const pickupNodes: Node[] = [];
  for (const id of neededIds) {
    const w = whById.get(id);
    if (w && w.lat !== null && w.lng !== null) {
      pickupNodes.push({
        id: w.id,
        label: w.name,
        lat: w.lat,
        lng: w.lng,
        kind: "pickup",
        service: w.pickupMinutes,
      });
    }
  }
  const dropNodes: Node[] = withCoords.map((d) => ({
    id: d.id,
    label: d.label,
    lat: d.lat,
    lng: d.lng,
    kind: "dropoff",
    service: dropoffMin,
  }));

  const start: LatLng =
    opts.start ?? pickupNodes[0] ?? dropNodes[0] ?? { lat: 0, lng: 0 };

  const orderedPickups = nearestOrder(start, pickupNodes);
  const afterPickups = orderedPickups.length
    ? orderedPickups[orderedPickups.length - 1]
    : start;
  const orderedDrops = nearestOrder(afterPickups, dropNodes);
  const sequence = [...orderedPickups, ...orderedDrops];

  const stops: RouteStop[] = [];
  let cur: LatLng = start;
  let clock = 0; // minutes since start
  let totalKm = 0;
  for (const n of sequence) {
    const legKm = haversineKm(cur, n);
    const travelMin = (legKm / avgSpeed) * 60;
    clock += travelMin; // arrival time
    totalKm += legKm;
    stops.push({
      kind: n.kind,
      refId: n.id,
      label: n.label,
      lat: n.lat,
      lng: n.lng,
      legKm: Math.round(legKm * 10) / 10,
      etaMinutes: Math.round(clock),
    });
    clock += n.service; // service before the next leg
    cur = n;
  }

  return {
    stops,
    totalKm: Math.round(totalKm * 10) / 10,
    totalMinutes: Math.round(clock),
    skipped,
  };
}

/** Format cumulative minutes-from-now as an HH:MM clock, given a start time. */
export function etaClock(startMs: number, etaMinutes: number): string {
  const d = new Date(startMs + etaMinutes * 60_000);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}
