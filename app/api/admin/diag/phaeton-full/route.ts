import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { searchBrands, searchPrices } from "@/lib/phaeton/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Временная разведка: есть ли в полном ответе Phaeton /api/Search URL/поле фото.
export async function POST(req: NextRequest) {
  const guard = await requireAuth();
  if (guard instanceof NextResponse) return guard;
  const body = (await req.json().catch(() => ({}))) as { article?: string; brand?: string };
  const article = body.article || "GDB1330";
  try {
    const brands = await searchBrands(article);
    const brand = body.brand || brands.Items?.[0]?.Brand || "";
    const prices = await searchPrices({ article, brand, includeAnalogs: true });
    const first = (prices.Items?.[0] ?? {}) as unknown as Record<string, unknown>;
    // Ищем любые поля с image/photo/url/foto в ключе или значении.
    const imageish: Record<string, unknown> = {};
    const scan = (obj: Record<string, unknown>, prefix = "") => {
      for (const [k, v] of Object.entries(obj)) {
        const kk = (prefix + k).toLowerCase();
        if (/image|photo|img|foto|picture|url|thumb/.test(kk)) imageish[prefix + k] = v;
        if (typeof v === "string" && /\.(jpe?g|png|webp|gif)/i.test(v)) imageish[prefix + k] = v;
        if (v && typeof v === "object" && !Array.isArray(v))
          scan(v as Record<string, unknown>, prefix + k + ".");
      }
    };
    scan(first);
    return NextResponse.json({
      brandTried: brand,
      brandsCount: brands.Items?.length ?? 0,
      itemsCount: prices.Items?.length ?? 0,
      firstKeys: Object.keys(first),
      imageish,
      first,
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
