/**
 * Address → coordinates via the free OpenStreetMap Nominatim geocoder.
 * Server-side only. Returns null on any failure (caller decides the fallback).
 * Biased to Kazakhstan.
 */
// We only operate in Astana — pin geocoding to the city so ambiguous addresses
// don't resolve to Almaty or elsewhere.
const ASTANA_VIEWBOX = "71.20,51.35,71.70,51.00"; // lon1,lat1,lon2,lat2
const ASTANA_RE = /астан|astana|нур-?султан|nur-?sultan|целиноград/i;

export async function geocodeAddress(
  q: string
): Promise<{ lat: number; lng: number; display: string } | null> {
  let query = (q ?? "").trim();
  if (query.length < 3) return null;
  // Force the city into the query if the manager didn't include it.
  if (!ASTANA_RE.test(query)) query = `Астана, ${query}`;

  const url =
    `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1` +
    `&countrycodes=kz&accept-language=ru` +
    `&viewbox=${ASTANA_VIEWBOX}&bounded=1` +
    `&q=${encodeURIComponent(query)}`;

  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    let res: Response;
    try {
      res = await fetch(url, {
        signal: ctrl.signal,
        cache: "no-store",
        headers: {
          "User-Agent": "scanpart-astana/1.0 (https://scanpart.kz)",
          Accept: "application/json",
        },
      });
    } finally {
      clearTimeout(t);
    }
    if (!res.ok) return null;
    const arr = (await res.json()) as Array<{ lat?: string; lon?: string; display_name?: string }>;
    const hit = arr?.[0];
    const lat = hit?.lat ? Number(hit.lat) : NaN;
    const lng = hit?.lon ? Number(hit.lon) : NaN;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return {
      lat: Math.round(lat * 1e6) / 1e6,
      lng: Math.round(lng * 1e6) / 1e6,
      display: hit?.display_name ?? "",
    };
  } catch {
    return null;
  }
}
