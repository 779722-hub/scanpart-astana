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

import { optimizeRoute } from "./optimize";

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

  const whById = new Map(warehouses.map((w) => [w.id, w]));
  const dropById = new Map(withCoords.map((d) => [d.id, d]));

  // Optimal interleaved order: pickups and dropoffs mixed to minimize travel,
  // with each dropoff still after all its required warehouse pickups.
  const opt = optimizeRoute(
    opts.start ?? null,
    withCoords.map((d) => ({ id: d.id, lat: d.lat, lng: d.lng, warehouseIds: d.warehouseIds })),
    warehouses
      .filter((w): w is RouteWarehouse & { lat: number; lng: number } => w.lat !== null && w.lng !== null)
      .map((w) => ({ id: w.id, lat: w.lat, lng: w.lng }))
  );

  const start: LatLng =
    opts.start ?? (opt.order[0] ? { lat: opt.order[0].lat, lng: opt.order[0].lng } : { lat: 0, lng: 0 });

  const stops: RouteStop[] = [];
  let cur: LatLng = start;
  let clock = 0; // minutes since start
  let totalKm = 0;
  for (const s of opt.order) {
    const legKm = haversineKm(cur, s);
    clock += (legKm / avgSpeed) * 60; // arrival time
    totalKm += legKm;
    const label =
      s.kind === "pickup" ? whById.get(s.refId)?.name ?? s.refId : dropById.get(s.refId)?.label ?? s.refId;
    const service = s.kind === "pickup" ? whById.get(s.refId)?.pickupMinutes ?? 0 : dropoffMin;
    stops.push({
      kind: s.kind,
      refId: s.refId,
      label,
      lat: s.lat,
      lng: s.lng,
      legKm: Math.round(legKm * 10) / 10,
      etaMinutes: Math.round(clock),
    });
    clock += service; // service before the next leg
    cur = s;
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
