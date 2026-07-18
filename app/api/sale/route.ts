import { NextRequest, NextResponse } from "next/server";
import { getSaleAstana } from "@/lib/phaeton/sale";
import { getSetting, getMarkupPercent } from "@/lib/sheets/settings";
import { applyMarkup } from "@/lib/markup";
import { partPhotoUrl } from "@/lib/parts/photos";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const enabled = (await getSetting("sale_enabled").catch(() => "off")) === "on";
  if (!enabled) return NextResponse.json({ ok: true, enabled: false, items: [], makes: [] });

  const [saleMarkupStr, baseMarkup, raw] = await Promise.all([
    getSetting("sale_markup_percent").catch(() => undefined),
    getMarkupPercent(),
    getSaleAstana().catch(() => []),
  ]);
  const saleMarkupNum = Number((saleMarkupStr ?? "").replace(",", "."));
  const markup = Number.isFinite(saleMarkupNum) && saleMarkupNum > 0 ? saleMarkupNum : baseMarkup;

  const sort = req.nextUrl.searchParams.get("sort") || "make";
  const makeFilter = (req.nextUrl.searchParams.get("make") || "").toUpperCase();

  let items = raw.map((it) => ({
    id: `sale:${it.brand}:${it.article}`,
    brand: it.brand,
    article: it.article,
    name: it.name,
    applicability: it.applicability,
    make: it.make,
    price: applyMarkup(it.priceRaw, markup),
    oldPrice: it.oldPrice ? applyMarkup(it.oldPrice, markup) : null,
    deliveryDays: it.deliveryDays,
    available: it.available,
    image: partPhotoUrl(it.article, it.brand),
  }));

  const makes = Array.from(new Set(items.map((i) => i.make).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b, "ru")
  );
  if (makeFilter) items = items.filter((i) => i.make === makeFilter);

  const discountPct = (i: { price: number; oldPrice: number | null }) =>
    i.oldPrice && i.oldPrice > i.price ? (i.oldPrice - i.price) / i.oldPrice : 0;
  items.sort((a, b) => {
    if (sort === "price-asc") return a.price - b.price;
    if (sort === "price-desc") return b.price - a.price;
    if (sort === "discount") return discountPct(b) - discountPct(a);
    // «make» по умолчанию: марка, затем название.
    return a.make.localeCompare(b.make, "ru") || a.name.localeCompare(b.name, "ru");
  });

  return NextResponse.json({ ok: true, enabled: true, count: items.length, makes, items });
}
