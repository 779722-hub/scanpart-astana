import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import {
  readWarehouses,
  upsertWarehouse,
  deleteWarehouse,
  ensureSheetStructure,
} from "@/lib/sheets/client";
import { validateWarehouse } from "@/lib/delivery/warehouse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requireAuth();
  if (guard instanceof NextResponse) return guard;
  try {
    const warehouses = await readWarehouses();
    return NextResponse.json({ ok: true, warehouses });
  } catch {
    // The Warehouses sheet may not exist yet — create it, then return empty.
    await ensureSheetStructure().catch(() => {});
    return NextResponse.json({ ok: true, warehouses: [] });
  }
}

export async function PUT(req: NextRequest) {
  const guard = await requireAuth();
  if (guard instanceof NextResponse) return guard;
  const body = await req.json().catch(() => null);
  const res = validateWarehouse(body ?? {}, new Date().toISOString());
  if (!res.ok) {
    return NextResponse.json({ ok: false, error: res.error }, { status: 400 });
  }
  await upsertWarehouse(res.warehouse);
  return NextResponse.json({ ok: true, warehouse: res.warehouse });
}

export async function DELETE(req: NextRequest) {
  const guard = await requireAuth();
  if (guard instanceof NextResponse) return guard;
  const { id } = (await req.json().catch(() => ({}))) as { id?: string };
  if (!id) return NextResponse.json({ ok: false, error: "no_id" }, { status: 400 });
  await deleteWarehouse(id);
  return NextResponse.json({ ok: true });
}
