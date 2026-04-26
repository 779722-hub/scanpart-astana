import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/session";
import { removeCustomerVin, saveCustomerVin } from "@/lib/auth/customers";
import { isVinFormatValid, normalizeVin } from "@/lib/vin/validator";

export const runtime = "nodejs";

const schema = z.object({ vin: z.string().min(1).max(20) });

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session.customer) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  }
  const vin = normalizeVin(parsed.data.vin);
  // Allow either real VINs or "MANUAL…" placeholder for manual entries.
  if (!vin.startsWith("MANUAL") && !isVinFormatValid(vin)) {
    return NextResponse.json({ ok: false, error: "bad_vin" }, { status: 400 });
  }
  await saveCustomerVin(session.customer.email, vin);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session.customer) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  }
  await removeCustomerVin(session.customer.email, parsed.data.vin);
  return NextResponse.json({ ok: true });
}
