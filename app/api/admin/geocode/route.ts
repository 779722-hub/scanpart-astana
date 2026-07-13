import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/guards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Address → coordinates via the free OpenStreetMap Nominatim geocoder, so the
 * manager can fill a warehouse/office point without hunting coordinates by hand.
 * Biased to Kazakhstan; returns null coords when nothing is found.
 */
export async function GET(req: NextRequest) {
  const guard = await requireAuth();
  if (guard instanceof NextResponse) return guard;

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 3) {
    return NextResponse.json({ ok: false, error: "too_short" }, { status: 400 });
  }

  const url =
    `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1` +
    `&countrycodes=kz&accept-language=ru&q=${encodeURIComponent(q)}`;

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
    if (!res.ok) return NextResponse.json({ ok: false, error: "geocoder_unavailable" }, { status: 502 });
    const arr = (await res.json()) as Array<{ lat?: string; lon?: string; display_name?: string }>;
    const hit = arr?.[0];
    const lat = hit?.lat ? Number(hit.lat) : NaN;
    const lng = hit?.lon ? Number(hit.lon) : NaN;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return NextResponse.json({ ok: false, error: "not_found" });
    }
    return NextResponse.json({
      ok: true,
      lat: Math.round(lat * 1e6) / 1e6,
      lng: Math.round(lng * 1e6) / 1e6,
      display: hit?.display_name ?? "",
    });
  } catch {
    return NextResponse.json({ ok: false, error: "geocoder_unavailable" }, { status: 502 });
  }
}
