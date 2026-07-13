import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { readDeliveries, readWarehouses } from "@/lib/sheets/client";
import { buildCourierPlan } from "@/lib/delivery/plan";
import { handoverWaLink } from "@/lib/delivery/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The logged-in courier's active deliveries + an optimised route with ETAs. */
export async function GET(req: NextRequest) {
  const session = await getSession();
  const courier = session.courier;
  if (!courier) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const [allDeliveries, warehouses] = await Promise.all([
    readDeliveries().catch(() => []),
    readWarehouses().catch(() => []),
  ]);

  const active = allDeliveries.filter(
    (d) =>
      d.courierId === courier.id &&
      (d.status === "assigned" || d.status === "picking" || d.status === "en_route")
  );

  // Courier's live position from the app (?lat=&lng=).
  const lat = Number(req.nextUrl.searchParams.get("lat"));
  const lng = Number(req.nextUrl.searchParams.get("lng"));
  const start = Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 ? { lat, lng } : null;

  const rwarehouses = warehouses.map((w) => ({
    id: w.id,
    name: w.name,
    lat: w.lat,
    lng: w.lng,
    pickupMinutes: w.pickupMinutes,
  }));

  // Same plan the admin panel shows — one order at a time from the courier.
  const plan = await buildCourierPlan(active, rwarehouses, start);

  // Never leak the handover code to the courier before it is issued/needed.
  // For deliveries already en route, hand back a ready wa.me link so the courier
  // can (re)send the code with one tap — reliably, even after a page reload.
  const deliveries = plan.sorted.map((d, i) => ({
    id: d.id,
    customerName: d.customerName,
    phone: d.phone,
    whatsapp: d.whatsapp,
    address: d.address,
    lat: d.lat,
    lng: d.lng,
    items: d.items,
    warehouseIds: d.warehouseIds,
    status: d.status,
    seq: i + 1,
    locked: plan.current ? d.id !== plan.current.id : false,
    waLink: d.status === "en_route" && d.handoverCode ? handoverWaLink(d, d.handoverCode) : undefined,
  }));

  return NextResponse.json({ ok: true, deliveries, route: plan.route });
}
