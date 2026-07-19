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
import { buildCourierPlan, type RoutePlan } from "@/lib/delivery/plan";
import { notifyDelivery } from "@/lib/delivery/notify-telegram";
import { geocodeAddress, isInAstana } from "@/lib/geocode";
import type { Delivery, DeliveryStatus } from "@/lib/delivery/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  // Optional: the SAME plan the courier app shows for one courier — routed from
  // the courier's live position through the current order (identical stops,
  // distance and time).
  const courierId = req.nextUrl.searchParams.get("courierId");
  let route: RoutePlan | null = null;
  if (courierId) {
    const [warehouses, locations] = await Promise.all([
      readWarehouses().catch(() => []),
      readCourierLocations().catch(() => []),
    ]);
    const active = deliveries.filter(
      (d) =>
        d.courierId === courierId &&
        (d.status === "assigned" || d.status === "accepted" || d.status === "picking" || d.status === "en_route")
    );
    const loc = locations.find((l) => l.courierId === courierId);
    const start = loc && isInAstana(loc.lat, loc.lng) ? { lat: loc.lat, lng: loc.lng } : null;
    const whRoute = warehouses.map((w) => ({ id: w.id, name: w.name, lat: w.lat, lng: w.lng, pickupMinutes: w.pickupMinutes }));
    route = (await buildCourierPlan(active, whRoute, start)).route;
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

  // Resolve coordinates: use what was sent, else geocode the address so the
  // delivery is routable without the manager pasting coordinates by hand.
  // We only work in Astana — any coordinate outside the city (stale or
  // mis-geocoded) is discarded and re-derived from the address.
  let lat = toNum(p.lat);
  let lng = toNum(p.lng);
  if (!isInAstana(lat, lng)) {
    lat = null;
    lng = null;
    if (p.address.trim()) {
      const g = await geocodeAddress(p.address).catch(() => null);
      if (g && isInAstana(g.lat, g.lng)) {
        lat = g.lat;
        lng = g.lng;
      }
    }
  }

  const delivery: Delivery = {
    id: p.id || `d-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4)}`,
    createdAt: existing?.createdAt || new Date().toISOString(),
    customerName: p.customerName,
    phone: p.phone,
    whatsapp: p.whatsapp,
    address: p.address,
    lat,
    lng,
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
