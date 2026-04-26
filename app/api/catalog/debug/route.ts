import { NextRequest, NextResponse } from "next/server";
import { findArticles } from "@/lib/autodoc/client";
import { requireRole } from "@/lib/auth/guards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Диагностика autodoc-парсинга. Только для owner — показывает HTTP-статус,
 * был ли cloudflare-challenge, какие URL пробовали и какие позиции
 * вытащили. Используется при настройке селекторов.
 */
export async function GET(req: NextRequest) {
  const guard = await requireRole("owner");
  if (guard instanceof NextResponse) return guard;

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  const make = req.nextUrl.searchParams.get("make") ?? undefined;
  const model = req.nextUrl.searchParams.get("model") ?? undefined;
  if (!q) {
    return NextResponse.json({ ok: false, error: "q required" }, { status: 400 });
  }

  const t0 = Date.now();
  const result = await findArticles(q, { make, model });
  return NextResponse.json({
    ok: true,
    elapsedMs: Date.now() - t0,
    query: q,
    vehicle: { make, model },
    ...result,
  });
}
