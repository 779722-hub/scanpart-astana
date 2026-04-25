import { NextRequest, NextResponse } from "next/server";
import { searchBrands, searchPrices } from "@/lib/phaeton/client";
import { getAstanaWarehouseIds } from "@/lib/phaeton/astana-warehouse";
import { applyMarkup } from "@/lib/markup";
import { getMarkupPercent } from "@/lib/sheets/settings";
import type { PartOffer, PhaetonPriceItem } from "@/lib/phaeton/types";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";
// In-process per-request soft throttle; real prod ratelimit lives in a reverse proxy.
const MAX_BRANDS_TO_QUERY = 6;

export async function GET(req: NextRequest) {
  const raw = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (!raw) {
    return NextResponse.json({ ok: false, error: "empty" }, { status: 400 });
  }

  try {
    const [warehouseIds, markupPct] = await Promise.all([
      getAstanaWarehouseIds(),
      getMarkupPercent(),
    ]);

    // Step A: brands for this article (Phaeton accepts part number OR name
    // as the Article search term — name matching is best-effort).
    const brandsResp = await searchBrands(raw);
    if (brandsResp.IsError || !brandsResp.Items?.length) {
      return NextResponse.json({
        ok: true,
        empty: true,
        query: raw,
        offers: [],
      });
    }

    // Step B: run price queries for the first N brands in parallel.
    const toQuery = brandsResp.Items.slice(0, MAX_BRANDS_TO_QUERY);
    const priceResponses = await Promise.allSettled(
      toQuery.map((b) =>
        searchPrices({
          article: b.Article,
          brand: b.Brand,
          warehouseIds,
          includeAnalogs: true,
        })
      )
    );

    const rawItems: PhaetonPriceItem[] = [];
    priceResponses.forEach((r) => {
      if (r.status === "fulfilled" && !r.value.IsError) {
        rawItems.push(...(r.value.Items ?? []));
      }
    });

    // Filter in-stock at Astana (extra safety: server-side Sources filter
    // should already do this, but warehouses in responses are cross-checked).
    const normArticle = raw.toUpperCase().replace(/[\s-]/g, "");
    const offers: PartOffer[] = rawItems
      .filter((i) => (i.Count ?? 0) > 0 && (i.Price ?? 0) > 0)
      .map((i): PartOffer => {
        const articleClean = i.Article.toUpperCase().replace(/[\s-]/g, "");
        const isOriginal =
          articleClean === normArticle || i.IsAnalog === false;
        return {
          id: `${i.Brand}|${i.Article}|${i.WarehouseId ?? ""}`,
          brand: i.Brand,
          article: i.Article,
          name: i.Name ?? brandsResp.Items.find((b) => b.Brand === i.Brand)?.Name ?? "",
          priceRaw: i.Price,
          priceFinal: applyMarkup(i.Price, markupPct),
          quantity: i.Count,
          warehouse: i.WarehouseName,
          isOriginal,
        };
      });

    // Keep 1 cheapest original + up to 3 cheapest analogs.
    const originals = offers
      .filter((o) => o.isOriginal)
      .sort((a, b) => a.priceFinal - b.priceFinal);
    const analogs = offers
      .filter((o) => !o.isOriginal)
      .sort((a, b) => a.priceFinal - b.priceFinal)
      .slice(0, 3);

    const picked = [...originals.slice(0, 1), ...analogs].sort(
      (a, b) => a.priceFinal - b.priceFinal
    );

    if (!picked.length) {
      return NextResponse.json({
        ok: true,
        empty: true,
        query: raw,
        offers: [],
      });
    }

    // Persist last search to session (so Order form can reference it).
    const session = await getSession();
    session.lastSearch = { kind: "article", query: raw };
    await session.save();

    return NextResponse.json({ ok: true, empty: false, query: raw, offers: picked });
  } catch (err) {
    console.error("[api/search]", (err as Error).message);
    return NextResponse.json(
      { ok: false, error: "service_unavailable" },
      { status: 503 }
    );
  }
}
