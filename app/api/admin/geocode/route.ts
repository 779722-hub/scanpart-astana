import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { geocodeAddress } from "@/lib/geocode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Address → coordinates, so the manager can fill a warehouse/office point
 * without hunting coordinates by hand. Biased to Kazakhstan.
 */
export async function GET(req: NextRequest) {
  const guard = await requireAuth();
  if (guard instanceof NextResponse) return guard;

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 3) {
    return NextResponse.json({ ok: false, error: "too_short" }, { status: 400 });
  }
  const hit = await geocodeAddress(q);
  if (!hit) return NextResponse.json({ ok: false, error: "not_found" });
  return NextResponse.json({ ok: true, lat: hit.lat, lng: hit.lng, display: hit.display });
}
