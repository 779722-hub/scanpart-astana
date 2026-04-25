import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { listOrders } from "@/lib/sheets/client";

export const runtime = "nodejs";

export async function GET() {
  const guard = await requireAuth();
  if (guard instanceof NextResponse) return guard;
  try {
    const orders = await listOrders(200);
    return NextResponse.json({ ok: true, orders });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 503 }
    );
  }
}
