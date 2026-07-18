import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { shopGetHtml, phaetonShopConfigured } from "@/lib/phaeton/shop-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Разведка раздела «Распродажа» в shop.phaeton.kz.
export async function POST(req: NextRequest) {
  const guard = await requireAuth();
  if (guard instanceof NextResponse) return guard;
  if (!phaetonShopConfigured()) {
    return NextResponse.json({ ok: false, error: "no_creds" }, { status: 400 });
  }
  const body = (await req.json().catch(() => ({}))) as { path?: string };
  const path = body.path || "/ru-RU";
  try {
    const { status, html } = await shopGetHtml(path);
    // Ссылки на разделы, похожие на распродажу/акции/скидки.
    const links = Array.from(
      html.matchAll(/href="([^"]+)"[^>]*>([^<]{0,60})/gi),
      (m) => ({ href: m[1], text: m[2].trim() })
    ).filter(
      (l) =>
        /распродаж|sale|акци|скидк|discount|stock|special|clearance/i.test(l.href) ||
        /распродаж|акци|скидк|уценк|sale/i.test(l.text)
    );
    // Любые /Search/ или /Catalog/ эндпоинты (могут быть с параметром sale).
    const endpoints = Array.from(
      new Set(
        Array.from(html.matchAll(/["'(](\/[a-z-]*\/(?:Search|Catalog|Sale|Products)[^"'()\s]*)["')]/gi), (m) => m[1])
      )
    ).slice(0, 25);
    return NextResponse.json({
      path,
      status,
      htmlLen: html.length,
      loggedOut: /Account\/Login/i.test(html),
      saleLinks: Array.from(new Map(links.map((l) => [l.href, l])).values()).slice(0, 25),
      endpoints,
      raw: html.slice(0, 2500),
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
