import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import {
  readCouriers,
  readCourierLocations,
  readDeliveries,
  readWarehouses,
  ensureSheetStructure,
} from "@/lib/sheets/client";
import { buildRoute } from "@/lib/delivery/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTIVE = new Set(["assigned", "accepted", "picking", "en_route"]);

export async function GET() {
  const guard = await requireAuth();
  if (guard instanceof NextResponse) return guard;

  let couriers, locations, deliveries, warehouses;
  try {
    [couriers, locations, deliveries, warehouses] = await Promise.all([
      readCouriers(),
      readCourierLocations(),
      readDeliveries(),
      readWarehouses(),
    ]);
  } catch {
    await ensureSheetStructure().catch(() => {});
    return NextResponse.json({ ok: true, couriers: [] });
  }

  const locById = new Map(locations.map((l) => [l.courierId, l]));
  const whById = new Map(warehouses.map((w) => [w.id, w]));

  const rows = couriers
    .filter((c) => c.active)
    .map((c) => {
      const active = deliveries.filter((d) => d.courierId === c.id && ACTIVE.has(d.status));
      const loc = locById.get(c.id) ?? null;

      // Cheap straight-line plan (no external call — this endpoint polls often).
      // Defensive: a bad row must never blank out the whole live view.
      let route = { stops: [] as { kind: "pickup" | "dropoff"; label: string }[], totalKm: 0, totalMinutes: 0 };
      try {
        route = buildRoute(
          active.map((d) => ({
            id: d.id,
            label: d.customerName || d.address,
            lat: d.lat,
            lng: d.lng,
            warehouseIds: d.warehouseIds,
          })),
          warehouses.map((w) => ({ id: w.id, name: w.name, lat: w.lat, lng: w.lng, pickupMinutes: w.pickupMinutes })),
          { start: loc ? { lat: loc.lat, lng: loc.lng } : null }
        );
      } catch {
        /* keep the empty default */
      }

      // "Where is he heading now": once en route → the customer; else the next stop.
      const hasEnroute = active.some((d) => d.status === "en_route");
      let destination: string | null = null;
      let destinationKind: "pickup" | "dropoff" | null = null;
      if (route.stops.length) {
        const target = hasEnroute
          ? route.stops.find((s) => s.kind === "dropoff") ?? route.stops[0]
          : route.stops[0];
        destination = target.label;
        destinationKind = target.kind;
      }

      // Which warehouses this courier collects from (names, deduped).
      const whNames = Array.from(
        new Set(active.flatMap((d) => d.warehouseIds))
      )
        .map((id) => whById.get(id)?.name)
        .filter((n): n is string => Boolean(n));

      return {
        id: c.id,
        name: c.name,
        phone: c.phone,
        activeCount: active.length,
        enRoute: active.filter((d) => d.status === "en_route").length,
        location: loc ? { lat: loc.lat, lng: loc.lng, updatedAt: loc.updatedAt } : null,
        destination,
        destinationKind,
        totalKm: route.totalKm,
        totalMinutes: route.totalMinutes,
        warehouseNames: whNames,
      };
    });

  return NextResponse.json({ ok: true, couriers: rows });
}
