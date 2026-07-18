import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { shopGetHtml, phaetonShopConfigured } from "@/lib/phaeton/shop-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Разведка пагинации/скидок раздела распродажи.
export async function POST(req: NextRequest) {
  const guard = await requireAuth();
  if (guard instanceof NextResponse) return guard;
  if (!phaetonShopConfigured()) return NextResponse.json({ ok: false, error: "no_creds" }, { status: 400 });
  const body = (await req.json().catch(() => ({}))) as { path?: string };
  const path = body.path || "/ru-RU/SaleOut";
  try {
    const { status, html } = await shopGetHtml(path);
    const products = (html.match(/<table class="table offers-table"/gi) || []).length;
    const astana = (html.match(/<td>\s*Астана\s*<\/td>/gi) || []).length;
    // Пагинация: ссылки/атрибуты с номерами страниц.
    const pager = Array.from(
      new Set(
        Array.from(
          html.matchAll(/(?:href|data-page|data-url|data-ajax-url)="([^"]*(?:page|Page|SaleOut)[^"]*)"/gi),
          (m) => m[1]
        )
      )
    ).slice(0, 20);
    // Кусок HTML вокруг пагинатора (номера страниц 1 2 3 …).
    const pagerBlock = /pagination[\s\S]{0,600}/i.exec(html)?.[0]?.replace(/\s+/g, " ").slice(0, 600) ?? "";
    // Скидочный бейдж (−53%): контекст.
    const discountCtx = Array.from(html.matchAll(/-?\d{1,2}\s*%/g), (m) => {
      const at = m.index ?? 0;
      return html.slice(Math.max(0, at - 60), at + 12).replace(/\s+/g, " ");
    }).slice(0, 4);
    // Форма фильтров: select/checkbox с городами/складами.
    const form = /<form[^>]*filters-form[\s\S]*?<\/form>/i.exec(html)?.[0] ?? "";
    const filterFields = Array.from(
      form.matchAll(/<(select|input)[^>]*\bname="([^"]+)"[^>]*>/gi),
      (m) => ({ tag: m[1], name: m[2] })
    );
    // Опции, где встречаются города/склад.
    const cityOpts = Array.from(
      form.matchAll(/<option[^>]*value="([^"]*)"[^>]*>\s*([^<]*(?:Астана|Алматы|Караганда|склад|Склад)[^<]*)</gi),
      (m) => ({ value: m[1], label: m[2].trim() })
    ).slice(0, 15);
    return NextResponse.json({
      path, status, htmlLen: html.length, products, astana, pager, pagerBlock, discountCtx,
      filterFields: filterFields.slice(0, 20), cityOpts, formLen: form.length,
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
