import { NextRequest, NextResponse } from "next/server";
import { searchBrands, searchPrices } from "@/lib/phaeton/client";
import { getAstanaWarehouseIds } from "@/lib/phaeton/astana-warehouse";
import { applyMarkup } from "@/lib/markup";
import { getMarkupPercent, getAnalogsMax, getWarehouseMarkupMap, getSetting } from "@/lib/sheets/settings";
import type {
  PartOffer,
  PhaetonBrandItem,
  PhaetonPriceItem,
} from "@/lib/phaeton/types";
import { getSession } from "@/lib/session";
import { classifyCompat } from "@/lib/compat";
import { findArticles as autodocFindArticles } from "@/lib/autodoc/client";
import { findAliasMatches } from "@/lib/aliases";
import { appendSearchLog } from "@/lib/sheets/client";
import { searchShatemOffers } from "@/lib/shatem/search";
import { searchAutotradeOffers, searchAutotradeRelated } from "@/lib/autotrade/search";
import { autotradeConfigured } from "@/lib/autotrade/session";
import { articlesByVinAndName, articlesByVehicleAndName } from "@/lib/shatem/catalog";
import { pickPerSource, partKey } from "@/lib/search/pick";
import { partPhotoUrl } from "@/lib/parts/photos";

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
  const kind: "article" | "name" =
    req.nextUrl.searchParams.get("k") === "name" ? "name" : "article";
  if (!raw) {
    return NextResponse.json({ ok: false, error: "empty" }, { status: 400 });
  }

  try {
    const session = await getSession();
    const vehicle = session.vehicle;
    const customerEmail = session.customer?.email ?? "";

    // Log every name-search outcome for the admin "Что искали" tab.
    // Fire-and-forget so we don't slow down the response. We log AFTER
    // we know offer count, near the two empty-return paths and also at
    // the success path with offersCount > 0.
    const logSearch = (offersCount: number) => {
      if (kind !== "name") return;
      void appendSearchLog({
        timestamp: new Date().toISOString(),
        query: raw,
        make: vehicle?.make ?? "",
        model: vehicle?.model ?? "",
        vin: session.vin ?? "",
        offersCount,
        customerEmail,
      }).catch((err) =>
        console.warn("[api/search] search log failed:", (err as Error).message)
      );
    };

    const [warehouseIds, markupPct, analogsMax, whMarkup, showOemSetting] = await Promise.all([
      getAstanaWarehouseIds().catch((err) => {
        console.warn("[api/search] astana warehouse resolver failed:", (err as Error).message);
        return [] as string[];
      }),
      getMarkupPercent(),
      getAnalogsMax(),
      getWarehouseMarkupMap().catch(() => ({} as Record<string, number>)),
      getSetting("show_oem").catch(() => "on"),
    ]);
    // OEM display is on by default; admin can switch it off (too many variants).
    const showOem = (showOemSetting ?? "on") !== "off";

    // Фото деталей — по умолчанию ВЫКЛ (opt-in). Включается в админке.
    // При «on» отдаём офферам URL прокси /api/part-photo (ручной слот →
    // фото из каталога Shate-M по артикулу → логотип). Резолв ленивый, в
    // самом маршруте, кэшируется CDN — поиск не замедляется.
    const showPhotos =
      (await getSetting("show_photos").catch(() => "off")) === "on";

    // Global markup by default, overridden per warehouse (admin «Склады»).
    const SOURCE_CODE: Record<string, string> = { phaeton: "Р1", shatem: "М2", autotrade: "Т3" };
    const codeOf = (o: PartOffer): string =>
      o.sourceCode || SOURCE_CODE[o.source ?? "phaeton"] || "";
    const markupForOffer = (o: PartOffer): number => whMarkup[codeOf(o)] ?? markupPct;

    // Catalog (Shate-M Laximo) — name search for a known vehicle by VIN turns
    // the free-text name into concrete OEM part numbers for THIS car, which we
    // then price across Phaeton + Shate-M. Gated on web-session config and
    // fully fail-safe.
    const webConfigured = Boolean(
      (process.env.SHATEM_WEB_LOGIN && process.env.SHATEM_WEB_PASSWORD) ||
        process.env.SHATEM_SESSION_COOKIE
    );
    const realVin =
      session.vin && !session.vin.startsWith("MANUAL") ? session.vin : "";
    // A car chosen via the by-model wizard carries the Laximo triple — it drives
    // the catalog exactly like a VIN does.
    const ref = session.vehicleRef;
    // A name search for a KNOWN vehicle must be catalog-driven so results fit
    // the car. When true we never fall back to free-text/alias search — that
    // fallback is exactly what produced non-fitting "фантазии".
    const vinScoped =
      kind === "name" && webConfigured && (Boolean(realVin) || Boolean(ref));
    const catalogOems: string[] = vinScoped
      ? await (ref
          ? articlesByVehicleAndName(
              {
                vehicleId: ref.vehicleId,
                catalog: ref.catalog,
                ssd: ref.ssd,
                brand: vehicle?.make ?? "",
                name: vehicle?.model ?? "",
              },
              raw
            ).then((ps) => ps.map((p) => p.oem))
          : articlesByVinAndName(realVin, raw).then((r) => r.parts.map((p) => p.oem))
        ).catch((err) => {
          console.warn("[api/search] shatem catalog failed:", (err as Error).message);
          return [];
        })
      : [];
    const normArt = (s: string) => s.toUpperCase().replace(/[\s-]/g, "");
    const catalogArticleSet = new Set(catalogOems.map(normArt));

    // Second supplier — Shate-M price/stock (Astana, in-stock). Article search
    // prices the query; name search prices the catalog OEMs. Gated by apikey,
    // fully fail-safe so a Shate-M outage never breaks Phaeton results.
    const shatemTargets = kind === "article" ? [raw] : catalogOems;
    const shatemPromise: Promise<PartOffer[]> =
      process.env.SHATEM_API_KEY && shatemTargets.length
        ? Promise.all(
            shatemTargets.map((code) =>
              searchShatemOffers(code, { markupPct }).catch((err) => {
                console.warn("[api/search] shatem lookup failed:", (err as Error).message);
                return [] as PartOffer[];
              })
            )
          ).then((lists) => lists.flat())
        : Promise.resolve([]);

    // Third supplier — Autotrade (sklad.autotrade.kz, code Т3). Article search
    // prices the query (+ crosses/analogs); name search prices the catalog OEMs
    // (capped for latency — two API calls per target). Astana-only, fail-safe.
    const autotradeTargets = kind === "article" ? [raw] : catalogOems.slice(0, 3);
    const autotradePromise: Promise<PartOffer[]> =
      autotradeConfigured() && autotradeTargets.length
        ? Promise.all(
            autotradeTargets.map((code) =>
              searchAutotradeOffers(code, { markupPct }).catch((err) => {
                console.warn("[api/search] autotrade lookup failed:", (err as Error).message);
                return [] as PartOffer[];
              })
            )
          ).then((lists) => lists.flat())
        : Promise.resolve([]);

    // «Сопутствующие товары» — Autotrade's own related products (mounting kits,
    // caliper grease…) for an article search. Shown in a separate section.
    const autotradeRelatedPromise: Promise<PartOffer[]> =
      kind === "article" && autotradeConfigured()
        ? searchAutotradeRelated(raw, { markupPct }).catch((err) => {
            console.warn("[api/search] autotrade related failed:", (err as Error).message);
            return [] as PartOffer[];
          })
        : Promise.resolve([]);

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
      // For a VIN-scoped name search, price ONLY the catalog OEMs (vehicle-fit).
      // Free-text Phaeton search is not vehicle-aware and returns parts that
      // don't fit the car, so it's used only when there is no known vehicle.
      const variants: string[] = vinScoped ? [...catalogOems] : [raw];
      if (kind === "name" && !vinScoped && vehicle?.make) {
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
        kind === "name" && autodocOn && !vinScoped
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
        kind === "name" && !vinScoped
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

    // Await Shate-M early: a part Phaeton doesn't carry may still be in stock
    // at Shate-M, so we must not short-circuit on an empty Phaeton brand list.
    const [shatemOffers, autotradeOffers, autotradeRelated] = await Promise.all([
      shatemPromise,
      autotradePromise,
      autotradeRelatedPromise,
    ]);
    // Classify Shate-M / Autotrade offers against the vehicle too (they arrive
    // as "unknown"), so the fit check below sees their make hints as well.
    if (kind === "article" && vehicle?.make) {
      for (const o of shatemOffers) o.compat = classifyCompat(o.name, vehicle).compat;
      for (const o of autotradeOffers) o.compat = classifyCompat(o.name, vehicle).compat;
    }
    if (!brandsItems.length && !shatemOffers.length && !autotradeOffers.length) {
      logSearch(0);
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
        const fromCatalog =
          autodocKeys.has(k) || aliasKeys.has(k) || catalogArticleSet.has(cleanArticle);
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
          source: "phaeton",
        };
      });

    // Merge Shate-M + Autotrade offers (already normalized + Astana/in-stock).
    if (shatemOffers.length) allOffers.push(...shatemOffers);
    if (autotradeOffers.length) allOffers.push(...autotradeOffers);

    // Re-price every offer with its warehouse's markup (global unless the
    // warehouse has its own markup set in admin «Склады»). Done before the
    // pick/sort so "cheapest" reflects the real customer price.
    for (const o of allOffers) o.priceFinal = applyMarkup(o.priceRaw, markupForOffer(o));

    // Show ONLY what the customer asked for: Astana warehouses, in stock now.
    // No relaxation to delivery/other cities. Word-match applies to name
    // search; compat is a sort hint, never a hard filter, so vehicle-fit
    // catalog parts are never dropped.
    const wantsWords = kind === "name" && queryTokens.length > 0;
    const inAstanaStock = allOffers.filter(
      (o) => o.atAstana && o.inStockNow && (!wantsWords || o.matchesAllWords)
    );

    // Up to `analogsMax` (admin setting) distinct parts from EACH warehouse
    // (Р1/М2/Т3/Т4/Т5), deduped by part number so every warehouse is represented.
    const picked = pickPerSource(inAstanaStock, analogsMax);

    if (!picked.length) {
      logSearch(0);
      return NextResponse.json({ ok: true, empty: true, query: raw, offers: [] });
    }

    session.lastSearch = { kind, query: raw };
    await session.save();

    logSearch(picked.length);

    // Coded supplier label — never expose the real supplier name to customers.
    // Each source gets an opaque code shown in parentheses after the city.
    // Strip `source` from the payload so the real supplier never reaches the
    // client — only the opaque code survives, embedded in the warehouse label.
    const offers = picked.map(({ source, ...o }) => {
      // Prefer a per-offer code (Autotrade sets its warehouse's own Т3/Т4/Т5);
      // otherwise fall back to the source default (Phaeton Р1, Shate-M М2).
      const code = o.sourceCode || SOURCE_CODE[source ?? "phaeton"] || "?";
      return {
      ...o,
      image: showPhotos ? partPhotoUrl(o.article, o.brand) : undefined,
      warehouse: `${o.atAstana ? "Астана" : o.warehouse || "склад"} (${code})`,
      // Opaque supplier code — already shown to the client in the label; carried
      // explicitly so it can be stored on the order for internal pickup routing.
      sourceCode: code === "?" ? "" : code,
      // A VIN-scoped search draws every part from the vehicle's own catalog, so
      // they all fit — show them all as confirmed rather than the misleading
      // "совместимость не подтверждена" that name-text heuristics produce.
      ...(vinScoped
        ? { compat: "match" as const, compatReason: "подобрано по каталогу для вашего авто" }
        : {}),
      };
    });

    // «Сопутствующие товары» — re-price by warehouse markup, drop anything
    // already shown in the main results, cap and code like the main offers.
    const RELATED_MAX = 8;
    const pickedKeys = new Set(picked.map(partKey));
    const relatedSeen = new Set<string>();
    const relatedPayload = autotradeRelated
      .map((o) => {
        o.priceFinal = applyMarkup(o.priceRaw, markupForOffer(o));
        return o;
      })
      .filter((o) => {
        const k = partKey(o);
        if (pickedKeys.has(k) || relatedSeen.has(k)) return false;
        relatedSeen.add(k);
        return true;
      })
      .sort((a, b) => a.priceFinal - b.priceFinal)
      .slice(0, RELATED_MAX)
      .map(({ source, ...o }) => {
        const code = o.sourceCode || SOURCE_CODE[source ?? "phaeton"] || "?";
        return {
          ...o,
          // Сопутствующие — только точное фото Autotrade (rel=1 пропускает
          // подбор по каталогу Shate-M, где короткие коды дают ложные фото).
          image: showPhotos ? partPhotoUrl(o.article, o.brand, { rel: true }) : undefined,
          warehouse: `Астана (${code})`,
          sourceCode: code === "?" ? "" : code,
        };
      });

    // Part-number search for a KNOWN vehicle: warn whenever NO result is a
    // confirmed fit. "mismatch" = the description names a different car (loud,
    // hidden). "unconfirmed" = we can't confirm fit from the description (loud
    // banner, parts still shown). A single confirmed "match" clears the warning.
    const vehLabel = vehicle
      ? {
          make: vehicle.make,
          model: vehicle.model && vehicle.model !== "—" ? vehicle.model : "",
          year: vehicle.year && vehicle.year !== "—" ? vehicle.year : "",
        }
      : null;
    let fitWarning:
      | { make: string; model: string; year: string; level: "mismatch" | "unconfirmed"; needsVin?: boolean }
      | null = null;
    if (
      kind === "article" && vehLabel && picked.length > 0 &&
      !picked.some((o) => o.compat === "match")
    ) {
      fitWarning = {
        ...vehLabel,
        level: picked.some((o) => o.compat === "mismatch") ? "mismatch" : "unconfirmed",
      };
    } else if (kind === "name" && vehLabel && !realVin && !ref && picked.length > 0) {
      // A car was chosen MANUALLY without the catalog (free-text make/model, no
      // VIN and no wizard ref) — matches aren't verified. Warn and point to VIN.
      fitWarning = { ...vehLabel, level: "unconfirmed", needsVin: true };
    }

    // Оригинальный (OEM) номер = ЗАВОДСКОЙ номер для выбранного авто, из
    // VIN-каталога Laximo (Shate-M) — доступен при поиске по названию. Для
    // поиска по «сырому» артикулу заводского OEM у нас нет, поэтому не выдумываем.
    const oem =
      kind === "name" && showOem
        ? Array.from(new Set(catalogOems.filter(Boolean))).slice(0, 8)
        : [];

    return NextResponse.json({
      ok: true,
      empty: false,
      query: raw,
      offers,
      related: relatedPayload,
      oem,
      level: "exact",
      relaxed: false,
      fitWarning,
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
