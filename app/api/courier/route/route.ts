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

  const rwarehouses = warehouses.map((w) => ({
    id: w.id,
    name: w.name,
    lat: w.lat,
    lng: w.lng,
    pickupMinutes: w.pickupMinutes,
  }));
  const toRD = (d: (typeof active)[number]) => ({
    id: d.id,
    label: d.customerName || d.address,
    lat: d.lat,
    lng: d.lng,
    warehouseIds: d.warehouseIds,
  });

  // Optimal ORDER of the orders (which to do first) — by the sequence their
  // dropoffs appear in the full optimal route. Then one order at a time: an
  // in-progress delivery stays current until it's delivered.
  const globalRoute = buildRoute(active.map(toRD), rwarehouses, { start });
  const dropSeq = globalRoute.stops.filter((s) => s.kind === "dropoff").map((s) => s.refId);
  const orderIdx = (id: string) => {
    const i = dropSeq.indexOf(id);
    return i === -1 ? 999 : i;
  };
  const statusRank: Record<string, number> = { en_route: 0, picking: 1, assigned: 2 };
  const sorted = [...active].sort(
    (a, b) =>
      (statusRank[a.status] ?? 9) - (statusRank[b.status] ?? 9) ||
      orderIdx(a.id) - orderIdx(b.id) ||
      a.createdAt.localeCompare(b.createdAt)
  );
  const current = sorted[0] ?? null;

  // The map/route shown is the CURRENT order only: its warehouse pickup(s) then
  // its customer, from the courier's position.
  let routeWithGeo: {
    stops: typeof globalRoute.stops;
    totalKm: number;
    totalMinutes: number;
    skipped: string[];
    geometry: [number, number][] | null;
  } = { stops: [], totalKm: 0, totalMinutes: 0, skipped: [], geometry: null };
  if (current) {
    const r = buildRoute([toRD(current)], rwarehouses, { start });
    const stopCoords = r.stops.map((s) => ({ lat: s.lat, lng: s.lng }));
    const geoPts = start ? [start, ...stopCoords] : stopCoords;
    const road = geoPts.length >= 2 ? await roadPath(geoPts) : null;
    routeWithGeo = { ...r, geometry: road?.geometry ?? null };
  }

  // Never leak the handover code to the courier before it is issued/needed.
  // For deliveries already en route, hand back a ready wa.me link so the courier
  // can (re)send the code with one tap — reliably, even after a page reload.
  const deliveries = sorted.map((d, i) => ({
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
    locked: current ? d.id !== current.id : false,
    waLink: d.status === "en_route" && d.handoverCode ? handoverWaLink(d, d.handoverCode) : undefined,
  }));

  return NextResponse.json({ ok: true, deliveries, route: routeWithGeo });
}
