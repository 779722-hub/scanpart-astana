import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isVinFormatValid, normalizeVin } from "@/lib/vin/validator";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    vin?: string;
    vehicle?: { make?: string; model?: string; year?: string };
  };
  const vin = normalizeVin(body.vin ?? "");
  if (!isVinFormatValid(vin) || !body.vehicle?.make || !body.vehicle?.model) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const session = await getSession();
  session.vin = vin;
  session.vehicle = {
    make: body.vehicle.make,
    model: body.vehicle.model,
    year: body.vehicle.year ?? "",
  };
  await session.save();
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const session = await getSession();
  session.vin = undefined;
  session.vehicle = undefined;
  await session.save();
  return NextResponse.json({ ok: true });
}
