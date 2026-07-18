import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { autotradeApi } from "@/lib/autotrade/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Временная разведка: есть ли в ответе Autotrade URL картинок и какой их формат.
export async function POST(req: NextRequest) {
  const guard = await requireAuth();
  if (guard instanceof NextResponse) return guard;
  const body = (await req.json().catch(() => ({}))) as { q?: string; method?: string };
  const q = body.q || "колодки тормозные";
  try {
    const r = await autotradeApi("getItemsByQuery", {
      q,
      brand: "",
      mode: 1,
      strict: 1,
      page: 1,
      limit: 5,
      cross: 1,
      replace: 0,
      bycross: 0,
      related: 0,
    });
    const items = (r.items as Record<string, unknown>[] | undefined) ?? [];
    const first = items[0] ?? {};
    // Соберём все поля, где встречаются image/photo/img/foto в ключе или значении.
    const imageish: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(first)) {
      const key = k.toLowerCase();
      if (/image|photo|img|foto|picture|thumb/.test(key)) imageish[k] = v;
      if (typeof v === "string" && /\.(jpe?g|png|webp|gif)/i.test(v)) imageish[k] = v;
    }
    return NextResponse.json({
      code: r.code,
      count: items.length,
      firstKeys: Object.keys(first),
      imageish,
      sample: items.slice(0, 2),
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
