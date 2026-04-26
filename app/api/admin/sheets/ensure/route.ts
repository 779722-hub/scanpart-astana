import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { ensureSheetStructure } from "@/lib/sheets/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Owner-only endpoint that re-runs ensureSheetStructure(). Idempotent:
 * creates any missing sheet tab and (re)writes the header row. Existing
 * data rows (row 2+) are untouched.
 */
export async function POST() {
  const guard = await requireAuth();
  if (guard instanceof NextResponse) return guard;
  try {
    await ensureSheetStructure();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}
