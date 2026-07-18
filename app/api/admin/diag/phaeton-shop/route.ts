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
    const path = `/ru-RU/Search/Details?brand=${encodeURIComponent(brand)}&article=${encodeURIComponent(article)}`;
    const { status, html } = await shopGetHtml(path);
    const loggedOut = /loginForm|Account\/Login/i.test(html);
    // Все ссылки на изображения на странице.
    const imgs = Array.from(
      html.matchAll(/(?:src|data-src|href)="([^"]*\.(?:jpe?g|png|webp)[^"]*)"/gi),
      (m) => m[1]
    ).filter((u) => !/logo|icon|call-center|favicon/i.test(u));
    // Ссылки, похожие на фото товара (Photo/Image/Nomenclature/File/Upload).
    const productish = Array.from(
      html.matchAll(/["'(]([^"'()]*(?:Photo|Image|Nomenclature|File|Upload|Goods|Product)[^"'()]*)["')]/gi),
      (m) => m[1]
    ).filter((u) => /\.(jpe?g|png|webp)|Photo|Image|File/i.test(u)).slice(0, 20);
    return NextResponse.json({
      status,
      loggedOut,
      htmlLen: html.length,
      imgs: Array.from(new Set(imgs)).slice(0, 25),
      productish: Array.from(new Set(productish)),
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
