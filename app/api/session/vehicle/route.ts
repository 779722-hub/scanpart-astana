import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

// A car chosen via the by-model catalog wizard (no VIN).
const schema = z.object({
  vehicleId: z.number().int().positive(),
  catalog: z.string().min(1).max(60),
  ssd: z.string().min(1).max(4000),
  make: z.string().min(1).max(80),
  model: z.string().max(120).optional(),
  year: z.string().max(20).optional(),
});

export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  }
  const d = parsed.data;
  const session = await getSession();
  session.vin = ""; // catalog car has no VIN
  session.vehicle = { make: d.make, model: d.model || "—", year: d.year || "" };
  session.vehicleRef = { vehicleId: d.vehicleId, catalog: d.catalog, ssd: d.ssd };
  await session.save();
  return NextResponse.json({ ok: true });
}
