import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { shopGetHtml, phaetonShopConfigured } from "@/lib/phaeton/shop-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Разведка: логинимся в shop.phaeton.kz, открываем страницу товара, ищем фото.
export async function POST(req: NextRequest) {
  const guard = await requireAuth();
  if (guard instanceof NextResponse) return guard;
  if (!phaetonShopConfigured()) {
    return NextResponse.json({ ok: false, error: "no_creds — set PHAETON_SHOP_LOGIN/PASSWORD" }, { status: 400 });
  }
  const body = (await req.json().catch(() => ({}))) as { brand?: string; article?: string };
  const brand = body.brand || "WINKOD";
  const article = body.article || "W339055SA";
  try {
    // Прямой AJAX-эндпоинт картинок товара, найденный на странице Details.
    const imgPath = `/ru-RU/Search/GetProductImages?article=${encodeURIComponent(article)}&brand=${encodeURIComponent(brand)}&mode=images`;
    const imgRes = await shopGetHtml(imgPath);
    // Вытащим ссылки на картинки из ответа (JSON или HTML).
    const urls = Array.from(
      imgRes.html.matchAll(/["'(]([^"'()\s]*\.(?:jpe?g|png|webp)[^"'()\s]*)["')]/gi),
      (m) => m[1]
    );
    return NextResponse.json({
      endpoint: "GetProductImages",
      status: imgRes.status,
      len: imgRes.html.length,
      urls: Array.from(new Set(urls)).slice(0, 20),
      raw: imgRes.html.slice(0, 1200),
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
