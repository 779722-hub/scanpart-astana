import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { readDeliveries, readWarehouses } from "@/lib/sheets/client";
import { buildRoute } from "@/lib/delivery/route";
import { roadPath } from "@/lib/delivery/roadroute";
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

  // Optional courier start location from the app (?lat=&lng=).
  const lat = Number(req.nextUrl.searchParams.get("lat"));
  const lng = Number(req.nextUrl.searchParams.get("lng"));
  const start =
    Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0
      ? { lat, lng }
      : null;

  const route = buildRoute(
    active.map((d) => ({
      id: d.id,
      label: d.customerName || d.address,
      lat: d.lat,
      lng: d.lng,
      warehouseIds: d.warehouseIds,
    })),
    warehouses.map((w) => ({
      id: w.id,
      name: w.name,
      lat: w.lat,
      lng: w.lng,
      pickupMinutes: w.pickupMinutes,
    })),
    { start }
  );

  // Road geometry for the in-app map (falls back to no line if unreachable).
  const stopCoords = route.stops.map((s) => ({ lat: s.lat, lng: s.lng }));
  const geoPts = start ? [start, ...stopCoords] : stopCoords;
  const road = geoPts.length >= 2 ? await roadPath(geoPts) : null;
  const routeWithGeo = { ...route, geometry: road?.geometry ?? null };

  // Never leak the handover code to the courier before it is issued/needed.
  // For deliveries already en route, hand back a ready wa.me link so the courier
  // can (re)send the code to the customer with one tap — reliably, even after a
  // page reload.
  const deliveries = active.map((d) => ({
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
    waLink: d.status === "en_route" && d.handoverCode ? handoverWaLink(d, d.handoverCode) : undefined,
  }));

  return NextResponse.json({ ok: true, deliveries, route: routeWithGeo });
}
