import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { verifyOcrKeys } from "@/lib/vin/ocr";

export const runtime = "nodejs";

export async function POST() {
  const guard = await requireAuth();
  if (guard instanceof NextResponse) return guard;
  const report = await verifyOcrKeys();
  return NextResponse.json({ ok: true, ...report });
}
