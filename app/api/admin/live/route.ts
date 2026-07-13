import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import {
  readCouriers,
  readCourierLocations,
  readDeliveries,
  ensureSheetStructure,
} from "@/lib/sheets/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTIVE = new Set(["assigned", "picking", "en_route"]);

export async function GET() {
  const guard = await requireAuth();
  if (guard instanceof NextResponse) return guard;

  let couriers, locations, deliveries;
  try {
    [couriers, locations, deliveries] = await Promise.all([
      readCouriers(),
      readCourierLocations(),
      readDeliveries(),
    ]);
  } catch {
    await ensureSheetStructure().catch(() => {});
    return NextResponse.json({ ok: true, couriers: [] });
  }

  const locById = new Map(locations.map((l) => [l.courierId, l]));
  const rows = couriers
    .filter((c) => c.active)
    .map((c) => {
      const active = deliveries.filter((d) => d.courierId === c.id && ACTIVE.has(d.status));
      const loc = locById.get(c.id) ?? null;
      return {
        id: c.id,
        name: c.name,
        phone: c.phone,
        activeCount: active.length,
        enRoute: active.filter((d) => d.status === "en_route").length,
        location: loc ? { lat: loc.lat, lng: loc.lng, updatedAt: loc.updatedAt } : null,
      };
    });

  return NextResponse.json({ ok: true, couriers: rows });
}
