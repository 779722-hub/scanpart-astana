import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { upsertCourierLocation, readCourierLocations, ensureSheetStructure } from "@/lib/sheets/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const guard = await requireAuth();
  if (guard instanceof NextResponse) return guard;
  const out: Record<string, unknown> = {};
  try {
    await upsertCourierLocation("c-test-kur", 51.1345, 71.43);
    out.upsert = "ok";
  } catch (e) {
    out.upsert = `ERR: ${(e as Error).message}`;
    try {
      await ensureSheetStructure();
      out.ensure = "ok";
      await upsertCourierLocation("c-test-kur", 51.1345, 71.43);
      out.upsert2 = "ok";
    } catch (e2) {
      out.upsert2 = `ERR: ${(e2 as Error).message}`;
    }
  }
  try {
    out.rows = await readCourierLocations();
  } catch (e) {
    out.rows = `ERR: ${(e as Error).message}`;
  }
  return NextResponse.json(out);
}
