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
    // Контекст вокруг каждого GetSaleItems<guid> — увидим метку группы (склад/город?).
    const groupCtx = Array.from(
      html.matchAll(/GetSaleItems\/([0-9a-f-]{36})/gi),
      (m) => {
        const at = m.index ?? 0;
        const around = html.slice(Math.max(0, at - 400), at + 60).replace(/\s+/g, " ");
        return { guid: m[1], ctx: around.slice(-260) };
      }
    );
    // Упоминания городов с окружением (где именно город в строке товара).
    const cityCtx = Array.from(
      html.matchAll(/(Астана|Алматы|Караганда|Astana|Almaty)/gi),
      (m) => {
        const at = m.index ?? 0;
        return html.slice(Math.max(0, at - 120), at + 40).replace(/\s+/g, " ");
      }
    ).slice(0, 8);
    // Полные строки таблицы (для карты полей SaleOut).
    const rows = Array.from(
      html.matchAll(/<tr[^>]*data-price[\s\S]{0,900}?<\/tr>/gi),
      (m) => m[0].replace(/\s+/g, " ")
    ).slice(0, 3);
    return NextResponse.json({
      path,
      status,
      htmlLen: html.length,
      loggedOut: /Account\/Login/i.test(html),
      groupCtx: groupCtx.slice(0, 25),
      cityCtx,
      rows,
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
