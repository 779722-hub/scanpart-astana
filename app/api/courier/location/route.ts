import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/session";
import { upsertCourierLocation, ensureSheetStructure } from "@/lib/sheets/client";

export const runtime = "nodejs";

const schema = z.object({ lat: z.number(), lng: z.number() });

export async function POST(req: NextRequest) {
  const session = await getSession();
  const courier = session.courier;
  if (!courier) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  }
  try {
    await upsertCourierLocation(courier.id, parsed.data.lat, parsed.data.lng);
  } catch {
    await ensureSheetStructure().catch(() => {});
    await upsertCourierLocation(courier.id, parsed.data.lat, parsed.data.lng).catch(() => {});
  }
  return NextResponse.json({ ok: true });
}
