import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/guards";
import { setOrderStatus, deleteOrder, updateOrderFulfilment } from "@/lib/sheets/client";

export const runtime = "nodejs";

const STATUSES = ["Новый", "В работе", "Выполнен", "Отменён"] as const;
const schema = z
  .object({
    status: z.enum(STATUSES).optional(),
    orderType: z.enum(["Экспресс", "Самовывоз"]).optional(),
    address: z.string().max(300).optional(),
  })
  .refine(
    (d) => d.status !== undefined || d.orderType !== undefined || d.address !== undefined,
    { message: "empty" }
  );

export async function PATCH(
  req: NextRequest,
  { params }: { params: { row: string } }
) {
  const guard = await requireAuth();
  if (guard instanceof NextResponse) return guard;
  const rowNumber = Number(params.row);
  if (!Number.isInteger(rowNumber) || rowNumber < 2) {
    return NextResponse.json({ ok: false, error: "bad_row" }, { status: 400 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  }
  if (parsed.data.status !== undefined) {
    await setOrderStatus(rowNumber, parsed.data.status);
  }
  if (parsed.data.orderType !== undefined || parsed.data.address !== undefined) {
    await updateOrderFulfilment(rowNumber, {
      orderType: parsed.data.orderType,
      address: parsed.data.address,
    });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { row: string } }
) {
  const guard = await requireAuth();
  if (guard instanceof NextResponse) return guard;
  const rowNumber = Number(params.row);
  if (!Number.isInteger(rowNumber) || rowNumber < 2) {
    return NextResponse.json({ ok: false, error: "bad_row" }, { status: 400 });
  }
  await deleteOrder(rowNumber);
  return NextResponse.json({ ok: true });
}
