import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { readDeliveries, upsertDelivery } from "@/lib/sheets/client";
import { geocodeAddress, isInAstana } from "@/lib/geocode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Re-geocode deliveries whose coordinates are missing or fall outside Astana
 * (created before the Astana-only geocoder, or mis-pasted). Coordinates that
 * can't be resolved inside Astana are cleared, so nothing shows in the wrong
 * city.
 */
export async function POST() {
  const guard = await requireAuth();
  if (guard instanceof NextResponse) return guard;

  const all = await readDeliveries().catch(() => []);
  const targets = all
    .filter((d) => d.status !== "delivered" && d.status !== "canceled" && !isInAstana(d.lat, d.lng))
    .slice(0, 40);

  let fixed = 0;
  let cleared = 0;
  for (const d of targets) {
    let lat: number | null = null;
    let lng: number | null = null;
    if (d.address.trim()) {
      const g = await geocodeAddress(d.address).catch(() => null);
      if (g && isInAstana(g.lat, g.lng)) {
        lat = g.lat;
        lng = g.lng;
      }
    }
    if (lat !== d.lat || lng !== d.lng) {
      await upsertDelivery({ ...d, lat, lng });
      if (lat !== null) fixed++;
      else cleared++;
    }
  }

  return NextResponse.json({ ok: true, checked: targets.length, fixed, cleared });
}
