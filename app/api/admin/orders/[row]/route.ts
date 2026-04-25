import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/guards";
import { setOrderStatus } from "@/lib/sheets/client";

export const runtime = "nodejs";

const STATUSES = ["Новый", "В работе", "Выполнен", "Отменён"] as const;
const schema = z.object({
  status: z.enum(STATUSES),
});

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
  await setOrderStatus(rowNumber, parsed.data.status);
  return NextResponse.json({ ok: true });
}
