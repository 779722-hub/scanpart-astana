import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import {
  readDeliveries,
  readCouriers,
  readCourierLocations,
  readWarehouses,
} from "@/lib/sheets/client";
import { buildRoute, type RouteDelivery, type RouteWarehouse } from "@/lib/delivery/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTIVE = new Set(["assigned", "accepted", "picking", "en_route"]);

/**
 * Recommend which courier should take a delivery: the one whose route grows the
 * LEAST when it's inserted (cheapest-insertion). Answers the manager's "везти
 * первого клиента, или по пути заехать на второй склад?" — the numbers show it.
 */
export async function GET(req: NextRequest) {
  const guard = await requireAuth();
  if (guard instanceof NextResponse) return guard;

  const deliveryId = req.nextUrl.searchParams.get("deliveryId");
  if (!deliveryId) {
    return NextResponse.json({ ok: false, error: "no_delivery" }, { status: 400 });
  }

  const [deliveries, couriers, locations, warehouses] = await Promise.all([
    readDeliveries().catch(() => []),
    readCouriers().catch(() => []),
    readCourierLocations().catch(() => []),
    readWarehouses().catch(() => []),
  ]);

  const target = deliveries.find((d) => d.id === deliveryId);
  if (!target) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const whRoute: RouteWarehouse[] = warehouses.map((w) => ({
    id: w.id,
    name: w.name,
    lat: w.lat,
    lng: w.lng,
    pickupMinutes: w.pickupMinutes,
  }));
  const toRouteDelivery = (d: (typeof deliveries)[number]): RouteDelivery => ({
    id: d.id,
    label: d.customerName || d.address,
    lat: d.lat,
    lng: d.lng,
    warehouseIds: d.warehouseIds,
  });
  const locById = new Map(locations.map((l) => [l.courierId, l]));

  const suggestions = couriers
    .filter((c) => c.active)
    .map((c) => {
      const start = locById.get(c.id) ? { lat: locById.get(c.id)!.lat, lng: locById.get(c.id)!.lng } : null;
      const active = deliveries.filter((d) => d.courierId === c.id && ACTIVE.has(d.status) && d.id !== target.id);
      const base = buildRoute(active.map(toRouteDelivery), whRoute, { start });
      const withNew = buildRoute([...active, target].map(toRouteDelivery), whRoute, { start });
      return {
        courierId: c.id,
        courierName: c.name,
        activeCount: active.length,
        addedMinutes: Math.max(0, withNew.totalMinutes - base.totalMinutes),
        addedKm: Math.round((withNew.totalKm - base.totalKm) * 10) / 10,
        totalMinutes: withNew.totalMinutes,
      };
    })
    .sort((a, b) => a.addedMinutes - b.addedMinutes);

  return NextResponse.json({
    ok: true,
    best: suggestions[0]?.courierId ?? null,
    suggestions,
  });
}
