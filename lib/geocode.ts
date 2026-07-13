/**
 * Address → coordinates via the free OpenStreetMap Nominatim geocoder.
 * Server-side only. Returns null on any failure (caller decides the fallback).
 * Biased to Kazakhstan.
 */
export async function geocodeAddress(
  q: string
): Promise<{ lat: number; lng: number; display: string } | null> {
  const query = (q ?? "").trim();
  if (query.length < 3) return null;

  const url =
    `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1` +
    `&countrycodes=kz&accept-language=ru&q=${encodeURIComponent(query)}`;

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
