/**
 * Real road path for a courier run (server-side, Node runtime).
 *
 * Fetches a driving route through an ordered list of points from the public
 * OSRM demo server, returning the full polyline plus per-leg distance/time.
 * Straight-line estimates (see route.ts / haversineKm) stay the caller's
 * fallback: roadPath returns null on any failure and never throws.
 *
 * A 2GIS Routing key is a documented seam — when configured we would call the
 * 2GIS API instead; today only OSRM is actually wired up.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

export interface RoadLeg {
  km: number;
  min: number;
}

export interface RoadPath {
  legs: RoadLeg[]; // one per consecutive pair of points (points.length - 1)
  geometry: [number, number][]; // [lng, lat] pairs, the full polyline of the route
  totalKm: number;
  totalMin: number;
  provider: "osrm" | "2gis";
}

/** Sum leg distances/times into totals. Pure. km rounded to 0.1, min to nearest int. */
export function summarizeLegs(legs: RoadLeg[]): { totalKm: number; totalMin: number } {
  let km = 0;
  let min = 0;
  for (const l of legs) {
    km += l.km;
    min += l.min;
  }
  return { totalKm: Math.round(km * 10) / 10, totalMin: Math.round(min) };
}

const OSRM_TIMEOUT_MS = 6000;

/**
 * Fetch a driving road path through the ordered points. Returns null on any
 * failure (network, timeout, <2 points, bad response) so the caller can fall
 * back to straight-line estimates. Never throws.
 */
export async function roadPath(
  points: LatLng[],
  opts?: { twogisRoutingKey?: string; signal?: AbortSignal }
): Promise<RoadPath | null> {
  if (points.length < 2) return null;

  // 2GIS seam: when a Routing key is configured we would call the 2GIS Routing
  // API (POST https://routing.api.2gis.com/routing/7.0.0/global) here, map its
  // route legs/geometry into RoadPath, and set provider "2gis". Not implemented
  // yet — fall through to OSRM so the feature keeps working without the key.
  // TODO(2gis): implement the 2GIS Routing call and remove this fall-through.
  if (opts?.twogisRoutingKey) {
    // intentionally falls through to OSRM below
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), OSRM_TIMEOUT_MS);

    const coords = points.map((p) => `${p.lng},${p.lat}`).join(";");
    const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`;

    let res: Response;
    try {
      res = await fetch(url, { cache: "no-store", signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) return null;

    const data = await res.json();
    if (data?.code !== "Ok") return null;
    const route = data?.routes?.[0];
    const rawLegs = route?.legs;
    const coordinates = route?.geometry?.coordinates;
    if (!Array.isArray(rawLegs) || !Array.isArray(coordinates)) return null;

    const legs: RoadLeg[] = rawLegs.map((l: { distance: number; duration: number }) => ({
      km: Math.round((l.distance / 1000) * 10) / 10,
      min: Math.round(l.duration / 60),
    }));

    const { totalKm, totalMin } = summarizeLegs(legs);
    return {
      legs,
      geometry: coordinates as [number, number][],
      totalKm,
      totalMin,
      provider: "osrm",
    };
  } catch {
    return null;
  }
}
