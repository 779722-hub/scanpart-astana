import { NextRequest, NextResponse } from "next/server";
import { searchBrands, searchPrices } from "@/lib/phaeton/client";
import { getAstanaWarehouseIds } from "@/lib/phaeton/astana-warehouse";
import { applyMarkup } from "@/lib/markup";
import { getAnalogsMax, getMarkupPercent } from "@/lib/sheets/settings";
import type {
  PartOffer,
  PhaetonBrandItem,
  PhaetonPriceItem,
  RelaxLevel,
} from "@/lib/phaeton/types";
import { getSession } from "@/lib/session";
import { classifyCompat } from "@/lib/compat";
import { findArticles as autodocFindArticles } from "@/lib/autodoc/client";
import { findAliasMatches } from "@/lib/aliases";

export const runtime = "nodejs";
const MAX_BRANDS_TO_QUERY = 6;
const MAX_BRANDS_TO_QUERY_NAME = 12;
const AUTODOC_TOP_N = 8;

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

function shipmentDays(i: PhaetonPriceItem): number {
  return Math.max(
    i.ExpectedShipmentDays ?? 0,
    i.GuaranteedShipmentDays ?? 0,
    i.ExpectedDelivery ?? 0,
    i.GuaranteedDelivery ?? 0
  );
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
    const session = await getSession();
    const vehicle = session.vehicle;

    const [warehouseIds, markupPct, analogsMax] = await Promise.all([
      getAstanaWarehouseIds().catch((err) => {
        console.warn("[api/search] astana warehouse resolver failed:", (err as Error).message);
        return [] as string[];
      }),
      getMarkupPercent(),
      getAnalogsMax(),
    ]);

    // Step A — brands. For name search with a known vehicle we run several
    // text variants in parallel ("колодки", "колодки Nissan", "колодки
    // Nissan X-Trail") and merge their brand lists, dedupe by Brand+Article.
    // For name kind we ALSO query autodoc.ru in parallel: Phaeton's text
    // search is poor for Russian queries, but autodoc gives real (Brand,
    // Article) pairs that we then price through Phaeton like normal.
    let brandsItems: PhaetonBrandItem[];
    const autodocKeys = new Set<string>();
    const aliasKeys = new Set<string>();
    {
      const variants: string[] = [raw];
      if (kind === "name" && vehicle?.make) {
        variants.push(`${raw} ${vehicle.make}`);
        if (vehicle.model && vehicle.model !== "—" && vehicle.model.length > 1) {
          variants.push(`${raw} ${vehicle.make} ${vehicle.model}`);
        }
      }
      const phaetonPromise = Promise.allSettled(variants.map((v) => searchBrands(v)));
      // Autodoc-фолбэк включается флагом — по умолчанию выключен,
      // чтобы случайно не показать клиенту нерелевантные карточки из
      // боковых блоков «похожие товары». Включается через env
      // AUTODOC_ENABLED=true после ручной проверки в /api/catalog/debug.
      const autodocOn = process.env.AUTODOC_ENABLED === "true";
      const autodocPromise =
        kind === "name" && autodocOn
          ? autodocFindArticles(raw, {
              make: vehicle?.make,
              model: vehicle?.model && vehicle.model !== "—" ? vehicle.model : undefined,
            }).catch((err) => {
              console.warn("[api/search] autodoc lookup failed:", (err as Error).message);
              return { parts: [], status: 0, challenge: false, triedUrls: [] };
            })
          : Promise.resolve({ parts: [], status: 0, challenge: false, triedUrls: [] });

      // Словарь синонимов из админки. Это основной источник для
      // name-поиска: админ вручную ведёт пары query → (Brand, Article),
      // и Phaeton прайсит их без проблем.
      const aliasPromise =
        kind === "name"
          ? findAliasMatches(raw, vehicle?.make).catch((err) => {
              console.warn("[api/search] alias lookup failed:", (err as Error).message);
              return [];
            })
          : Promise.resolve([]);

      const [brandResponses, autodoc, aliases] = await Promise.all([
        phaetonPromise,
        autodocPromise,
        aliasPromise,
      ]);

      const seen = new Set<string>();
      brandsItems = [];
      for (const r of brandResponses) {
        if (r.status !== "fulfilled" || r.value.IsError) continue;
        for (const it of r.value.Items ?? []) {
          const k = `${it.Brand}|${it.Article}`;
          if (seen.has(k)) continue;
          seen.add(k);
          brandsItems.push(it);
        }
      }
      for (const p of (autodoc.parts ?? []).slice(0, AUTODOC_TOP_N)) {
        const k = `${p.brand}|${p.article}`;
        const upper = k.toUpperCase();
        autodocKeys.add(upper);
        if (seen.has(k)) continue;
        seen.add(k);
        brandsItems.push({ Brand: p.brand, Article: p.article, Name: p.name });
      }
      for (const ba of aliases) {
        const k = `${ba.brand}|${ba.article}`;
        const upper = k.toUpperCase();
        aliasKeys.add(upper);
        if (seen.has(k)) continue;
        seen.add(k);
        // Name пустой — Phaeton подставит своё в priceItem.Name.
        brandsItems.push({ Brand: ba.brand, Article: ba.article, Name: "" });
      }
    }
    if (!brandsItems.length) {
      return NextResponse.json({ ok: true, empty: true, query: raw, offers: [] });
    }

    // Step B — prices for each brand in parallel.
    const cap = kind === "name" ? MAX_BRANDS_TO_QUERY_NAME : MAX_BRANDS_TO_QUERY;
    const toQuery = brandsItems.slice(0, cap);
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

    // Tokenize query for the words-AND filter (name search only).
    const queryTokens = kind === "name" ? tokenize(raw) : [];
    const matchesAllWords = (name: string): boolean => {
      if (!queryTokens.length) return true;
      const hay = (name || "").toLowerCase();
      return queryTokens.every((tok) => hay.includes(tok));
    };
    const isAtAstana = (i: PhaetonPriceItem): boolean => {
      if (warehouseIds.length && i.WarehouseId && warehouseIds.includes(i.WarehouseId)) return true;
      return /астана|astana/i.test(i.Warehouse ?? "");
    };

    const normArticle = raw.toUpperCase().replace(/[\s\-]/g, "");
    const allOffers: PartOffer[] = rawItems
      .filter((i) => (i.AvailableCount ?? 0) > 0 && (i.Price ?? 0) > 0)
      .map((i): PartOffer => {
        const cleanArticle = (i.CleanArticle ?? i.Article).toUpperCase().replace(/[\s\-]/g, "");
        const isOriginal = cleanArticle === normArticle;
        const name = i.Name ?? brandsItems.find((b) => b.Brand === i.Brand)?.Name ?? "";
        const compat = classifyCompat(name, vehicle);
        const days = shipmentDays(i);
        const k = `${i.Brand}|${i.Article}`.toUpperCase();
        const fromCatalog = autodocKeys.has(k) || aliasKeys.has(k);
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
          atAstana: isAtAstana(i),
          inStockNow: days === 0,
          // autodoc-curated articles are already matched semantically to the
          // query — don't re-filter them by word presence in the (often
          // truncated) Phaeton name.
          matchesAllWords: fromCatalog ? true : matchesAllWords(name),
          shipmentDays: days,
          fromCatalog,
        };
      });

    // Relax ladder: try the most strict combination first, then drop one
    // requirement at a time and try again. The first non-empty result wins.
    type Step = { level: RelaxLevel; pred: (o: PartOffer) => boolean };
    const wantsCompat = strict && Boolean(vehicle?.make);
    const wantsWords = kind === "name" && queryTokens.length > 0;

    const steps: Step[] = [
      {
        level: "exact",
        pred: (o) =>
          o.atAstana &&
          o.inStockNow &&
          (!wantsWords || o.matchesAllWords) &&
          (!wantsCompat || o.compat === "match"),
      },
    ];
    if (wantsCompat) {
      steps.push({
        level: "no-make",
        pred: (o) =>
          o.atAstana && o.inStockNow && (!wantsWords || o.matchesAllWords),
      });
    }
    if (wantsWords) {
      steps.push({
        level: "no-words",
        pred: (o) => o.atAstana && o.inStockNow,
      });
    }
    steps.push({
      level: "with-delivery",
      pred: (o) => o.atAstana,
    });
    steps.push({
      level: "any-warehouse",
      pred: () => true,
    });

    let pickedRaw: PartOffer[] = [];
    let level: RelaxLevel = "exact";
    for (const step of steps) {
      const out = allOffers.filter(step.pred);
      if (out.length) {
        pickedRaw = out;
        level = step.level;
        break;
      }
    }

    // Pick top N: original first (if article search), then sort by compat+price.
    const sortByCompatPrice = (a: PartOffer, b: PartOffer) => {
      const cm = (a.compat === "match" ? 0 : 1) - (b.compat === "match" ? 0 : 1);
      if (cm !== 0) return cm;
      if (a.shipmentDays !== b.shipmentDays) return a.shipmentDays - b.shipmentDays;
      return a.priceFinal - b.priceFinal;
    };

    let picked: PartOffer[];
    if (kind === "name") {
      picked = pickedRaw.sort(sortByCompatPrice).slice(0, 1 + analogsMax);
    } else {
      const originals = pickedRaw
        .filter((o) => o.isOriginal)
        .sort(sortByCompatPrice);
      const analogs = pickedRaw
        .filter((o) => !o.isOriginal)
        .sort(sortByCompatPrice)
        .slice(0, analogsMax);
      picked = [...originals.slice(0, 1), ...analogs].sort(sortByCompatPrice);
    }

    if (!picked.length) {
      return NextResponse.json({ ok: true, empty: true, query: raw, offers: [] });
    }

    session.lastSearch = { kind, query: raw };
    await session.save();

    return NextResponse.json({
      ok: true,
      empty: false,
      query: raw,
      offers: picked,
      level,
      relaxed: level !== "exact",
    });
  } catch (err) {
    const msg = (err as Error).message;
    console.error("[api/search]", msg);
    const showDetail = !!process.env.DIAG_TOKEN;
    return NextResponse.json(
      { ok: false, error: "service_unavailable", ...(showDetail ? { detail: msg } : {}) },
      { status: 503 }
    );
  }
}
