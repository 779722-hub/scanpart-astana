import { NextRequest, NextResponse } from "next/server";
import { searchBrands, searchPrices } from "@/lib/phaeton/client";
import { getAstanaWarehouseIds } from "@/lib/phaeton/astana-warehouse";
import { applyMarkup } from "@/lib/markup";
import { getAnalogsMax, getMarkupPercent } from "@/lib/sheets/settings";
import type { PartOffer, PhaetonPriceItem } from "@/lib/phaeton/types";
import { getSession } from "@/lib/session";
import { classifyCompat } from "@/lib/compat";

export const runtime = "nodejs";
// In-process per-request soft throttle; real prod ratelimit lives in a reverse proxy.
const MAX_BRANDS_TO_QUERY = 6;
const MAX_BRANDS_TO_QUERY_NAME = 12;

const STOP_WORDS = new Set([
  "и", "или", "для", "на", "в", "по", "с", "от", "до", "но",
  "the", "a", "an", "and", "or", "for", "to", "of", "with",
]);

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[«»"']/g, " ")
    .split(/[\s\-,./()]+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
}

export async function GET(req: NextRequest) {
  const raw = (req.nextUrl.searchParams.get("q") ?? "").trim();
  const strict = req.nextUrl.searchParams.get("strict") === "1";
  const kind: "article" | "name" =
    req.nextUrl.searchParams.get("k") === "name" ? "name" : "article";
  if (!raw) {
    return NextResponse.json({ ok: false, error: "empty" }, { status: 400 });
  }

  try {
    // Read VIN-decoded vehicle from session for compat hints.
    const session = await getSession();
    const vehicle = session.vehicle;

    // Astana warehouse resolution: env override → Dictionary → fall back to no filter.
    const [warehouseIds, markupPct, analogsMax] = await Promise.all([
      getAstanaWarehouseIds().catch((err) => {
        console.warn("[api/search] astana warehouse resolver failed:", (err as Error).message);
        return [] as string[];
      }),
      getMarkupPercent(),
      getAnalogsMax(),
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
    const cap = kind === "name" ? MAX_BRANDS_TO_QUERY_NAME : MAX_BRANDS_TO_QUERY;
    const toQuery = brandsResp.Items.slice(0, cap);
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

    // Strict in-stock check: physically on the Astana shelf right now, no
    // delivery/transfer days. Items with any positive shipment days are
    // dropped — those would arrive from another city.
    const inStockNow = (i: PhaetonPriceItem): boolean => {
      const days = Math.max(
        i.ExpectedShipmentDays ?? 0,
        i.GuaranteedShipmentDays ?? 0,
        i.ExpectedDelivery ?? 0,
        i.GuaranteedDelivery ?? 0
      );
      return days === 0;
    };

    // For name-search: each meaningful query word (≥3 chars) must appear in
    // the part description. This kills the "брелок Nissan" type junk that
    // a bare text search returns.
    const queryTokens = kind === "name" ? tokenize(raw) : [];
    const matchesAllWords = (name: string): boolean => {
      if (!queryTokens.length) return true;
      const hay = (name || "").toLowerCase();
      return queryTokens.every((tok) => hay.includes(tok));
    };

    const normArticle = raw.toUpperCase().replace(/[\s\-]/g, "");
    const offers: PartOffer[] = rawItems
      .filter((i) => (i.AvailableCount ?? 0) > 0 && (i.Price ?? 0) > 0)
      .filter(inStockNow)
      .filter((i) => {
        if (warehouseIds.length && i.WarehouseId && warehouseIds.includes(i.WarehouseId)) return true;
        // Always prefer items whose warehouse name contains "Астана" — that's
        // the local-shelf signal we trust most.
        return /астана|astana/i.test(i.Warehouse ?? "");
      })
      .filter((i) => kind !== "name" || matchesAllWords(i.Name ?? ""))
      .map((i): PartOffer => {
        const cleanArticle = (i.CleanArticle ?? i.Article).toUpperCase().replace(/[\s\-]/g, "");
        const isOriginal = cleanArticle === normArticle;
        const name = i.Name ?? brandsResp.Items.find((b) => b.Brand === i.Brand)?.Name ?? "";
        const compat = classifyCompat(name, vehicle);
        return {
          id: `${i.Brand}|${i.Article}|${i.WarehouseId ?? ""}`,
          brand: i.Brand,
          article: i.Article,
          name,
          priceRaw: i.Price,
          priceFinal: applyMarkup(i.Price, markupPct),
          quantity: i.AvailableCount ?? 0,
          warehouse: i.Warehouse,
          isOriginal,
          compat: compat.compat,
          compatReason: compat.reason,
        };
      });

    // Strict-compat filter: when set (and a vehicle is known), drop items
    // that don't mention the customer's make in the description.
    const compatFiltered = strict && vehicle?.make
      ? offers.filter((o) => o.compat === "match")
      : offers;

    let picked: PartOffer[];
    if (kind === "name") {
      // For name search there's no "original" — show the cheapest 1 + analogsMax
      // matching items. Prefer compat:"match" first so vehicle-specific picks
      // float to the top regardless of price.
      picked = compatFiltered
        .sort((a, b) => {
          const cm = (a.compat === "match" ? 0 : 1) - (b.compat === "match" ? 0 : 1);
          if (cm !== 0) return cm;
          return a.priceFinal - b.priceFinal;
        })
        .slice(0, 1 + analogsMax);
    } else {
      // For part-number search: 1 cheapest original + up to N cheapest analogs.
      const originals = compatFiltered
        .filter((o) => o.isOriginal)
        .sort((a, b) => a.priceFinal - b.priceFinal);
      const analogs = compatFiltered
        .filter((o) => !o.isOriginal)
        .sort((a, b) => a.priceFinal - b.priceFinal)
        .slice(0, analogsMax);
      picked = [...originals.slice(0, 1), ...analogs].sort(
        (a, b) => a.priceFinal - b.priceFinal
      );
    }

    if (!picked.length) {
      return NextResponse.json({
        ok: true,
        empty: true,
        query: raw,
        offers: [],
      });
    }

    // Persist last search to session (so Order form can reference it).
    session.lastSearch = { kind, query: raw };
    await session.save();

    return NextResponse.json({ ok: true, empty: false, query: raw, offers: picked });
  } catch (err) {
    const msg = (err as Error).message;
    console.error("[api/search]", msg);
    // Temporary debug — expose message when DIAG_TOKEN is set in env. Remove after stabilizing.
    const showDetail = !!process.env.DIAG_TOKEN;
    return NextResponse.json(
      { ok: false, error: "service_unavailable", ...(showDetail ? { detail: msg } : {}) },
      { status: 503 }
    );
  }
}
