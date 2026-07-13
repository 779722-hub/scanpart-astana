import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/guards";
import {
  readDeliveries,
  upsertDelivery,
  deleteDelivery,
  readWarehouses,
  readCourierLocations,
  readCouriers,
  ensureSheetStructure,
} from "@/lib/sheets/client";
import { buildRoute } from "@/lib/delivery/route";
import { roadPath, type LatLng } from "@/lib/delivery/roadroute";
import { notifyDelivery } from "@/lib/delivery/notify-telegram";
import type { Delivery, DeliveryStatus } from "@/lib/delivery/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BuiltRoute = ReturnType<typeof buildRoute>;
type RichRoute = BuiltRoute & { geometry?: [number, number][] };

/**
 * Upgrade a straight-line route to real road geometry + times. When the
 * courier's live location is known (start), the road legs line up 1:1 with the
 * stops and we recompute per-stop ETAs (travel + service time). Without a start,
 * we still attach the drawable geometry but keep the straight-line ETAs.
 */
async function enrichWithRoad(
  route: BuiltRoute,
  start: LatLng | null,
  warehouses: { id: string; pickupMinutes: number }[]
): Promise<RichRoute> {
  if (!route.stops.length) return route;
  const stopCoords = route.stops.map((s) => ({ lat: s.lat, lng: s.lng }));
  const pts = start ? [start, ...stopCoords] : stopCoords;
  const road = await roadPath(pts);
  if (!road) return route;

  if (start && road.legs.length === route.stops.length) {
    const whMin = new Map(warehouses.map((w) => [w.id, w.pickupMinutes]));
    let clock = 0;
    const stops = route.stops.map((s, i) => {
      clock += road.legs[i].min; // travel to this stop
      const etaMinutes = Math.round(clock);
      clock += s.kind === "pickup" ? whMin.get(s.refId) ?? 0 : 5; // service before next leg
      return { ...s, legKm: road.legs[i].km, etaMinutes };
    });
    return { ...route, stops, totalKm: road.totalKm, totalMinutes: Math.round(clock), geometry: road.geometry };
  }
  return { ...route, geometry: road.geometry, totalKm: road.totalKm };
}

export async function GET(req: NextRequest) {
  const guard = await requireAuth();
  if (guard instanceof NextResponse) return guard;
  let deliveries: Delivery[];
  try {
    deliveries = await readDeliveries();
  } catch {
    await ensureSheetStructure().catch(() => {});
    deliveries = [];
  }

  // Optional: build the route for one courier's active deliveries (preview),
  // upgraded to real road geometry + times when possible (falls back to
  // straight-line if the routing service is unreachable).
  const courierId = req.nextUrl.searchParams.get("courierId");
  let route: RichRoute | null = null;
  if (courierId) {
    const [warehouses, locations] = await Promise.all([
      readWarehouses().catch(() => []),
      readCourierLocations().catch(() => []),
    ]);
    const active = deliveries.filter(
      (d) =>
        d.courierId === courierId &&
        (d.status === "assigned" || d.status === "picking" || d.status === "en_route")
    );
    const loc = locations.find((l) => l.courierId === courierId);
    const start = loc ? { lat: loc.lat, lng: loc.lng } : null;
    route = buildRoute(
      active.map((d) => ({ id: d.id, label: d.customerName || d.address, lat: d.lat, lng: d.lng, warehouseIds: d.warehouseIds })),
      warehouses.map((w) => ({ id: w.id, name: w.name, lat: w.lat, lng: w.lng, pickupMinutes: w.pickupMinutes }))
    );
    route = await enrichWithRoad(route, start, warehouses);
  }
  return NextResponse.json({ ok: true, deliveries, route });
}

const putSchema = z.object({
  id: z.string().optional(),
  customerName: z.string().max(120).default(""),
  phone: z.string().max(30).default(""),
  whatsapp: z.string().max(30).default(""),
  address: z.string().max(300).default(""),
  lat: z.union([z.number(), z.string()]).nullable().optional(),
  lng: z.union([z.number(), z.string()]).nullable().optional(),
  items: z.string().max(1000).default(""),
  warehouseIds: z.array(z.string()).default([]),
  courierId: z.string().default(""),
  status: z.string().optional(),
});

const toNum = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

export async function PUT(req: NextRequest) {
  const guard = await requireAuth();
  if (guard instanceof NextResponse) return guard;
  const parsed = putSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  }
  const p = parsed.data;
  const existing = p.id ? (await readDeliveries()).find((d) => d.id === p.id) : null;

  // Assigning a courier to an unstarted delivery moves it to "assigned".
  let status: DeliveryStatus =
    (p.status as DeliveryStatus) || existing?.status || "new";
  if (p.courierId && (status === "new")) status = "assigned";
  if (!p.courierId && status === "assigned") status = "new";

  const delivery: Delivery = {
    id: p.id || `d-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4)}`,
    createdAt: existing?.createdAt || new Date().toISOString(),
    customerName: p.customerName,
    phone: p.phone,
    whatsapp: p.whatsapp,
    address: p.address,
    lat: toNum(p.lat),
    lng: toNum(p.lng),
    items: p.items,
    warehouseIds: p.warehouseIds,
    courierId: p.courierId,
    status,
    handoverCode: existing?.handoverCode ?? "",
    deliveredAt: existing?.deliveredAt ?? "",
  };
  await upsertDelivery(delivery);

  // Notify the manager chat on creation / (re)assignment.
  try {
    let courierName: string | undefined;
    if (delivery.courierId) {
      const couriers = await readCouriers().catch(() => []);
      courierName = couriers.find((c) => c.id === delivery.courierId)?.name;
    }
    if (!existing) {
      await notifyDelivery("created", delivery, { courierName });
    } else if (delivery.courierId && existing.courierId !== delivery.courierId) {
      await notifyDelivery("assigned", delivery, { courierName });
    }
  } catch {
    /* notifications are best-effort */
  }

  return NextResponse.json({ ok: true, delivery });
}

export async function DELETE(req: NextRequest) {
  const guard = await requireAuth();
  if (guard instanceof NextResponse) return guard;
  const { id } = (await req.json().catch(() => ({}))) as { id?: string };
  if (!id) return NextResponse.json({ ok: false, error: "no_id" }, { status: 400 });
  await deleteDelivery(id);
  return NextResponse.json({ ok: true });
}
