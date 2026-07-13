import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/guards";
import { upsertCourierLocation, ensureSheetStructure } from "@/lib/sheets/client";

export const runtime = "nodejs";

/**
 * Manually set a courier's map position — used to test how couriers appear on
 * the map, or to pin a courier whose phone GPS is off.
 */
const schema = z.object({ courierId: z.string().min(1), lat: z.number(), lng: z.number() });

export async function POST(req: NextRequest) {
  const guard = await requireAuth();
  if (guard instanceof NextResponse) return guard;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  }
  const { courierId, lat, lng } = parsed.data;
  try {
    await upsertCourierLocation(courierId, lat, lng);
  } catch {
    await ensureSheetStructure().catch(() => {});
    await upsertCourierLocation(courierId, lat, lng).catch(() => {});
  }
  return NextResponse.json({ ok: true });
}
