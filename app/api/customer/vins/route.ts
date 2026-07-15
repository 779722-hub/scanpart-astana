import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/session";
import {
  removeCustomerVin,
  replaceCustomerVin,
  saveCustomerVin,
} from "@/lib/auth/customers";
import { isVinAcceptable, normalizeVin } from "@/lib/vin/validator";

export const runtime = "nodejs";

const oneSchema = z.object({ vin: z.string().min(1).max(20) });
const replaceSchema = z.object({
  oldVin: z.string().min(1).max(20),
  newVin: z.string().min(1).max(20),
});

function valid(vin: string): boolean {
  return vin.startsWith("MANUAL") || isVinAcceptable(vin);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session.customer) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const parsed = oneSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  }
  const vin = normalizeVin(parsed.data.vin);
  if (!valid(vin)) {
    return NextResponse.json({ ok: false, error: "bad_vin" }, { status: 400 });
  }
  await saveCustomerVin(session.customer.email, vin);
  return NextResponse.json({ ok: true, vin });
}

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session.customer) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const parsed = replaceSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  }
  const oldVin = normalizeVin(parsed.data.oldVin);
  const newVin = normalizeVin(parsed.data.newVin);
  if (!valid(newVin)) {
    return NextResponse.json({ ok: false, error: "bad_vin" }, { status: 400 });
  }
  await replaceCustomerVin(session.customer.email, oldVin, newVin);
  return NextResponse.json({ ok: true, vin: newVin });
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session.customer) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const parsed = oneSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  }
  await removeCustomerVin(session.customer.email, parsed.data.vin);
  return NextResponse.json({ ok: true });
}
