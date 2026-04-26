import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { findCustomer, listOrdersByCustomer } from "@/lib/sheets/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session.customer) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const fresh = await findCustomer(session.customer.email).catch(() => null);
  const orders = await listOrdersByCustomer(session.customer.email).catch(() => []);
  return NextResponse.json({
    ok: true,
    customer: {
      email: session.customer.email,
      name: fresh?.name ?? session.customer.name,
      phone: fresh?.phone ?? session.customer.phone,
      whatsapp: fresh?.whatsapp ?? session.customer.whatsapp,
      vins: fresh?.vins ?? [],
    },
    orders,
  });
}
