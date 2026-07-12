import { NextRequest, NextResponse } from "next/server";
import { wizardParameters } from "@/lib/shatem/catalog";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const catalogId = req.nextUrl.searchParams.get("catalogId") ?? "";
  const ssd = req.nextUrl.searchParams.get("ssd") ?? "";
  if (!catalogId) {
    return NextResponse.json({ ok: false, error: "no_catalog" }, { status: 400 });
  }
  try {
    const fields = await wizardParameters(catalogId, ssd);
    return NextResponse.json({ ok: true, fields });
  } catch (err) {
    console.warn("[api/catalog/wizard]", (err as Error).message);
    return NextResponse.json({ ok: false, fields: [] }, { status: 503 });
  }
}
