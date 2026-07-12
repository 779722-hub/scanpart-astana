import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { listCustomers } from "@/lib/sheets/client";

export const runtime = "nodejs";

/** Registered storefront customers (admin only). Never returns passwordHash. */
export async function GET() {
  const guard = await requireAuth();
  if (guard instanceof NextResponse) return guard;
  try {
    const customers = (await listCustomers()).map((c) => ({
      email: c.email,
      name: c.name,
      phone: c.phone,
      whatsapp: c.whatsapp,
      vins: c.vins,
      createdAt: c.createdAt,
    }));
    return NextResponse.json({ ok: true, customers });
  } catch (err) {
    console.error("[api/admin/customers]", (err as Error).message);
    return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });
  }
}
