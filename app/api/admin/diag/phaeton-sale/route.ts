import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { shopGetHtml, phaetonShopConfigured } from "@/lib/phaeton/shop-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const guard = await requireAuth();
  if (guard instanceof NextResponse) return guard;
  if (!phaetonShopConfigured()) return NextResponse.json({ ok: false, error: "no_creds" }, { status: 400 });
  const body = (await req.json().catch(() => ({}))) as { path?: string };
  try {
    const { html } = await shopGetHtml(body.path || "/ru-RU/SaleOut");
    // Бейдж скидки: элементы, содержащие «%» с числом (не CSS).
    const pct = Array.from(html.matchAll(/-?\d{1,2}\s*%/g), (m) => {
      const at = m.index ?? 0;
      return html.slice(Math.max(0, at - 130), at + 8).replace(/\s+/g, " ");
    }).filter((s) => /class|badge|discount|percent|sale|label|span|div/i.test(s) && !/top:|left:|width:|z-index|position/i.test(s)).slice(0, 6);
    // Полный внешний блок первого товара (внешняя <tr> с картинкой/бейджем).
    const firstProd = /<tr[^>]*>[\s\S]{0,2600}?offers-table/i.exec(html)?.[0]?.replace(/\s+/g, " ").slice(0, 2600) ?? "";
    return NextResponse.json({ pct, firstProd });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
