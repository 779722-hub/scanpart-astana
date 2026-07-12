import { NextResponse } from "next/server";
import { listCatalogs } from "@/lib/shatem/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function webConfigured(): boolean {
  return Boolean(
    (process.env.SHATEM_WEB_LOGIN && process.env.SHATEM_WEB_PASSWORD) ||
      process.env.SHATEM_SESSION_COOKIE
  );
}

export async function GET() {
  if (!webConfigured()) {
    return NextResponse.json({ ok: true, brands: [] });
  }
  try {
    const brands = await listCatalogs();
    return NextResponse.json({ ok: true, brands });
  } catch (err) {
    console.warn("[api/catalog/brands]", (err as Error).message);
    return NextResponse.json({ ok: false, brands: [] }, { status: 503 });
  }
}
