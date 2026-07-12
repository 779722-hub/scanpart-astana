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
  // Accept either a real VIN with valid format, OR a manual entry (make is enough).
  const isManual = vin.startsWith("MANUAL");
  if (!isManual && (!isVinFormatValid(vin) || !body.vehicle?.model)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  if (!body.vehicle?.make) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const session = await getSession();
  session.vin = isManual ? "" : vin;
  session.vehicle = {
    make: body.vehicle.make,
    model: body.vehicle.model ?? "—",
    year: body.vehicle.year ?? "",
  };
  session.vehicleRef = undefined; // a VIN/manual entry replaces any wizard car
  await session.save();

  // If a customer is signed in, save the VIN to their profile so it
  // appears in their personal account next time.
  if (!isManual && session.customer && vin) {
    const { saveCustomerVin } = await import("@/lib/auth/customers");
    saveCustomerVin(session.customer.email, vin).catch((err) =>
      console.warn("[session/vin] saveCustomerVin failed", err.message)
    );
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const session = await getSession();
  session.vin = undefined;
  session.vehicle = undefined;
  session.vehicleRef = undefined;
  await session.save();
  return NextResponse.json({ ok: true });
}
