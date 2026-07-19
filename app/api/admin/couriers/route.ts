import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/guards";
import { listCouriers, saveCourier } from "@/lib/auth/couriers";
import { deleteCourier, ensureSheetStructure } from "@/lib/sheets/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requireAuth();
  if (guard instanceof NextResponse) return guard;
  try {
    const couriers = await listCouriers();
    return NextResponse.json({ ok: true, couriers });
  } catch {
    await ensureSheetStructure().catch(() => {});
    return NextResponse.json({ ok: true, couriers: [] });
  }
}

const putSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(2).max(80),
  phone: z.string().min(4).max(30),
  whatsapp: z.string().max(30).optional(),
  login: z.string().min(3).max(40),
  password: z.string().min(4).max(100).optional(),
  active: z.boolean().optional(),
});

export async function PUT(req: NextRequest) {
  const guard = await requireAuth();
  if (guard instanceof NextResponse) return guard;
  const parsed = putSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  }
  // New courier must have a password.
  if (!parsed.data.id && !parsed.data.password) {
    return NextResponse.json({ ok: false, error: "password_required" }, { status: 400 });
  }
  const c = await saveCourier(parsed.data);
  return NextResponse.json({
    ok: true,
    courier: { id: c.id, name: c.name, phone: c.phone, whatsapp: c.whatsapp, login: c.login, active: c.active },
  });
}

export async function DELETE(req: NextRequest) {
  const guard = await requireAuth();
  if (guard instanceof NextResponse) return guard;
  const { id } = (await req.json().catch(() => ({}))) as { id?: string };
  if (!id) return NextResponse.json({ ok: false, error: "no_id" }, { status: 400 });
  await deleteCourier(id);
  return NextResponse.json({ ok: true });
}
