import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { readDeliveries, readCouriers } from "@/lib/sheets/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * История рейсов курьера: сколько выполнено (доставлено), по какой ставке и на
 * какую сумму, плюс последние адреса — курьер видит свою работу и заработок.
 */
export async function GET() {
  const session = await getSession();
  const courier = session.courier;
  if (!courier) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const [deliveries, couriers] = await Promise.all([
    readDeliveries().catch(() => []),
    readCouriers().catch(() => []),
  ]);
  const rate = couriers.find((c) => c.id === courier.id)?.ratePerTrip ?? 0;
  const done = deliveries
    .filter((d) => d.courierId === courier.id && d.status === "delivered")
    .sort((a, b) => (b.deliveredAt || "").localeCompare(a.deliveredAt || ""));
  const list = done.slice(0, 50).map((d) => ({
    date: d.deliveredAt || d.createdAt,
    address: d.address,
    customerName: d.customerName,
    items: d.items,
  }));
  const trips = done.length;
  return NextResponse.json({ ok: true, trips, rate, earned: trips * rate, list });
}
