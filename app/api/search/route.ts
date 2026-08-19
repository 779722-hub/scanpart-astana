import { NextRequest, NextResponse } from "next/server";
import { searchBrands, searchPrices } from "@/lib/phaeton/client";
import { getAstanaWarehouseIds } from "@/lib/phaeton/astana-warehouse";
import { applyMarkup, applyBracketMarkup, type PriceBracket } from "@/lib/markup";
import { getMarkupPercent, getAnalogsMax, getPriceBrackets, getSetting } from "@/lib/sheets/settings";
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
import { searchInterkomOffers } from "@/lib/interkom/search";
import { interkomConfigured } from "@/lib/interkom/session";
import { articlesByVinAndName, articlesByVehicleAndName } from "@/lib/shatem/catalog";
import { pickPerSource, partKey } from "@/lib/search/pick";
import { partPhotoUrl } from "@/lib/parts/photos";

export const runtime = "nodejs";
// Фоновая фаза Phaeton (?phase=phaeton) на холодном инстансе тянет ~230КБ по
// прокси КЗ >20с (таймаут клиента 25с + возможный повтор) — даём запас.
export const maxDuration = 60;
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
  // Прогрессивная выдача: быстрые поставщики (М2/Т3-Т5) — сразу, а Phaeton (Р1)
  // грузится клиентом отдельным фоновым запросом ?phase=phaeton и дописывается
  // в список. Быстрый путь НЕ обращается к Phaeton вовсе.
  const phase = req.nextUrl.searchParams.get("phase");
  // «Свободный поиск на любое авто» (чек-бокс) — и для парт-номера, и для
  // названия. Игнорируем установленное авто: не привязываемся к VIN-каталогу,
  // не показываем fitWarning, а Interkom опрашиваем по ВСЕМ сегментам брендов.
  const anyCar = req.nextUrl.searchParams.get("anycar") === "1";
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

    // NB: Astana warehouse IDs come from Phaeton's /api/Dictionary, so we resolve
    // them ONLY inside the Phaeton phase below — the fast path never calls Phaeton.
    const [markupPct, analogsMax, brackets, showOemSetting] = await Promise.all([
      getMarkupPercent(),
      getAnalogsMax(),
      getPriceBrackets().catch(() => [] as PriceBracket[]),
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

    // Interkom (И6) — new Astana supplier. Configured via env; gated behind an
    // admin toggle (default off) until verified live in prod.
    const interkomEnabled =
      interkomConfigured() &&
      (await getSetting("interkom_enabled").catch(() => "off")) === "on";

    // Наценка по диапазонам входящей цены (общая наценка — резерв). Единая для
    // всех складов; по одной цене поставщика, а не по коду склада.
    const SOURCE_CODE: Record<string, string> = { phaeton: "Р1", shatem: "М2", autotrade: "Т3", interkom: "И6" };
    const priceFor = (o: PartOffer): number =>
      applyBracketMarkup(o.priceRaw, brackets, markupPct);

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
    // «Любое авто» для названия снимает привязку к каталогу выбранного авто —
    // работает НЕ vinScoped-путь (свободный текст Phaeton + синонимы).
    const vinScoped =
      kind === "name" && !anyCar && webConfigured && (Boolean(realVin) || Boolean(ref));

    // Manual car (make/year, no VIN and no wizard ref): a name search has no
    // catalog binding, so we can't safely surface warehouse parts (a free-text
    // supplier search would return parts for the wrong car — "фантазии"). Steer
    // the customer to add a VIN instead of silently returning empty. Reused on
    // both the empty and the has-offers responses below.
    const vinSteer =
      kind === "name" && !anyCar && vehicle?.make && !realVin && !ref
        ? {
            make: vehicle.make,
            model: vehicle.model && vehicle.model !== "—" ? vehicle.model : "",
            year: vehicle.year && vehicle.year !== "—" ? vehicle.year : "",
            level: "unconfirmed" as const,
            needsVin: true,
          }
        : null;
    // Name-search Phaeton phase can receive the fast phase's already-resolved
    // catalog OEMs via ?oems=<csv>, so we price them in Phaeton directly and
    // skip the slow (~15s) Laximo catalog re-resolution. Capped to bound
    // latency (matches the fast phase's `oem` slice). Falls back to
    // re-resolution when absent/empty.
    const providedOems =
      phase === "phaeton" && kind === "name"
        ? (req.nextUrl.searchParams.get("oems") ?? "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
            .slice(0, 8)
        : [];
    const catalogOems: string[] = vinScoped
      ? providedOems.length
        ? providedOems
        : await (ref
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

    // Shared payload mapper — strip supplier `source` (never leaks to the
    // client) and stamp the opaque warehouse code (Р1/М2/Т3-Т5). Used by both
    // the fast phase and the Phaeton phase so their offers are shaped identically.
    const codeOffers = (list: PartOffer[]) =>
      list.map(({ source, ...o }) => {
        // Prefer a per-offer code (Autotrade sets its warehouse's own Т3/Т4/Т5);
        // otherwise fall back to the source default (Phaeton Р1, Shate-M М2).
        const code = o.sourceCode || SOURCE_CODE[source ?? "phaeton"] || "?";
        return {
          ...o,
          image: showPhotos ? partPhotoUrl(o.article, o.brand) : undefined,
          warehouse: `${o.atAstana ? "Астана" : o.warehouse || "склад"} (${code})`,
          // Opaque supplier code — carried explicitly so it can be stored on the
          // order for internal pickup routing.
          sourceCode: code === "?" ? "" : code,
          // A VIN-scoped search draws every part from the vehicle's own catalog,
          // so they all fit — show them all as confirmed.
          ...(vinScoped
            ? { compat: "match" as const, compatReason: "подобрано по каталогу для вашего авто" }
            : {}),
        };
      });

    // ======================================================================
    // PHAETON PHASE — background-only. Query ONLY Phaeton (Р1), build offers
    // with the SAME Astana/in-stock filter + markup + coded label as the fast
    // phase, and return them for the client to append. Never blocks the UI.
    // ======================================================================
    if (phase === "phaeton") {
      // Astana warehouse IDs (Phaeton Dictionary, 24h in-module cache) — used to
      // filter Phaeton price items and scope searchPrices. Fail-safe to [].
      const warehouseIds = await getAstanaWarehouseIds().catch((err) => {
        console.warn("[api/search] astana warehouse resolver failed:", (err as Error).message);
        return [] as string[];
      });

      // Step A — brands. For a VIN-scoped name search, price ONLY the catalog
      // OEMs (vehicle-fit). Free-text Phaeton search isn't vehicle-aware, so
      // it's used only when there is no known vehicle (also feeds autodoc/alias).
      let brandsItems: PhaetonBrandItem[];
      const autodocKeys = new Set<string>();
      const aliasKeys = new Set<string>();
      {
        // Поиск по номеру терпим к пробелам: Phaeton опрашиваем одной
        // нормализованной формой (без пробелов). Поиск по названию — как есть.
        const variants: string[] = vinScoped
          ? [...catalogOems]
          : [kind === "article" ? raw.replace(/\s+/g, "") : raw];
        if (kind === "name" && !vinScoped && !anyCar && vehicle?.make) {
          variants.push(`${raw} ${vehicle.make}`);
          if (vehicle.model && vehicle.model !== "—" && vehicle.model.length > 1) {
            variants.push(`${raw} ${vehicle.make} ${vehicle.model}`);
          }
        }
        const phaetonPromise = Promise.allSettled(variants.map((v) => searchBrands(v)));
        // Autodoc-фолбэк включается флагом — по умолчанию выключен.
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

        // Словарь синонимов из админки (query → (Brand, Article)).
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
          autodocKeys.add(k.toUpperCase());
          if (seen.has(k)) continue;
          seen.add(k);
          brandsItems.push({ Brand: p.brand, Article: p.article, Name: p.name });
        }
        for (const ba of aliases) {
          const k = `${ba.brand}|${ba.article}`;
          aliasKeys.add(k.toUpperCase());
          if (seen.has(k)) continue;
          seen.add(k);
          brandsItems.push({ Brand: ba.brand, Article: ba.article, Name: "" });
        }
      }

      if (!brandsItems.length) {
        return NextResponse.json({ ok: true, offers: [] });
      }

      // Step B — prices for each brand in parallel.
      const cap = kind === "name" ? MAX_BRANDS_TO_QUERY_NAME : MAX_BRANDS_TO_QUERY;
      const priceResponses = await Promise.allSettled(
        brandsItems.slice(0, cap).map((b) =>
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
      const phaetonOffers: PartOffer[] = rawItems
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
            matchesAllWords: fromCatalog ? true : matchesAllWords(name),
            shipmentDays: days,
            fromCatalog,
            source: "phaeton",
          };
        });

      // Итоговая цена — по диапазонам входящей цены (резерв — общая наценка).
      for (const o of phaetonOffers) o.priceFinal = priceFor(o);

      // Astana + in-stock now; word-match for name search (same as fast phase).
      const wantsWords = kind === "name" && queryTokens.length > 0;
      const inAstanaStock = phaetonOffers.filter(
        (o) => o.atAstana && o.inStockNow && (!wantsWords || o.matchesAllWords)
      );
      const picked = pickPerSource(inAstanaStock, analogsMax);

      return NextResponse.json({ ok: true, offers: codeOffers(picked) });
    }

    // ======================================================================
    // FAST PHASE — Shate-M (М2) + Autotrade (Т3-Т5) only. Returns quickly even
    // on a cold instance. Sets `phaetonPending` when Phaeton could contribute
    // (article search always; name search when there are catalog OEMs) so the
    // client fetches the Phaeton phase in the background.
    // ======================================================================
    const phaetonPending =
      kind === "article" || (kind === "name" && (catalogOems.length > 0 || anyCar));

    // Second supplier — Shate-M price/stock (Astana, in-stock). Article search
    // prices the query; name search prices the catalog OEMs. Gated by apikey,
    // fully fail-safe.
    // Поиск по номеру терпим к пробелам/дефисам: «AH 03004» = «AH03004» =
    // «AH-03004». Опрашиваем небольшой набор форм (исходная, без пробелов, без
    // пробелов и дефисов); clean() схлопывает офферы при дедупе/isOriginal.
    // Ограничено ≤3 различными формами (обычно 1-2). Interkom — одна форма
    // (без пробелов), тяжёлый Phaeton — тоже одна (см. фазу выше).
    const numberVariants = Array.from(
      new Set(
        [raw.trim(), raw.replace(/\s+/g, ""), raw.replace(/[\s-]/g, "")].filter(Boolean)
      )
    );
    const numberNormalized = raw.replace(/\s+/g, "");

    const shatemTargets = kind === "article" ? numberVariants : catalogOems;
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
    // (capped for latency). Astana-only, fail-safe.
    const autotradeTargets = kind === "article" ? numberVariants : catalogOems.slice(0, 3);
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

    // Fourth supplier — Interkom (opt.interkom.kz, code И6). Article search
    // prices the query; name search prices the catalog OEMs (capped for
    // latency). Segment picked from the car make. Astana-only, fail-safe.
    // Interkom itemsSearch (≥4 симв., ищет по артикулу/OEM/наименованию):
    // по номеру — одна форма без пробелов; по названию на «любое авто» —
    // прямой текст запроса (allSegments); иначе — OEM из каталога.
    const interkomTargets =
      kind === "article"
        ? [numberNormalized]
        : anyCar
          ? [raw]
          : catalogOems.slice(0, 3);
    const interkomPromise: Promise<PartOffer[]> =
      interkomEnabled && interkomTargets.length
        ? Promise.all(
            interkomTargets.map((code) =>
              searchInterkomOffers(code, { markupPct, make: vehicle?.make, allSegments: anyCar }).catch((err) => {
                console.warn("[api/search] interkom lookup failed:", (err as Error).message);
                return [] as PartOffer[];
              })
            )
          ).then((lists) => lists.flat())
        : Promise.resolve([]);

    // «Сопутствующие товары» — Autotrade's own related products for an article
    // search. Shown in a separate section.
    const autotradeRelatedPromise: Promise<PartOffer[]> =
      kind === "article" && autotradeConfigured()
        ? searchAutotradeRelated(raw, { markupPct }).catch((err) => {
            console.warn("[api/search] autotrade related failed:", (err as Error).message);
            return [] as PartOffer[];
          })
        : Promise.resolve([]);

    const [shatemOffers, autotradeOffers, interkomOffers, autotradeRelated] = await Promise.all([
      shatemPromise,
      autotradePromise,
      interkomPromise,
      autotradeRelatedPromise,
    ]);
    // Classify Shate-M / Autotrade / Interkom offers against the vehicle (they
    // arrive as "unknown"), so the fit check below sees their make hints too.
    if (kind === "article" && vehicle?.make) {
      for (const o of shatemOffers) o.compat = classifyCompat(o.name, vehicle).compat;
      for (const o of autotradeOffers) o.compat = classifyCompat(o.name, vehicle).compat;
      for (const o of interkomOffers) o.compat = classifyCompat(o.name, vehicle).compat;
    }

    // Свободный поиск по НАЗВАНИЮ через Interkom матчит Наименование на стороне
    // поставщика; всё равно применяем наш строгий фильтр «все слова» локально —
    // только конкретные совпадения, без «фантазий». Interkom отдаёт офферы с
    // matchesAllWords=true, поэтому пересчитываем по словам запроса.
    if (kind === "name" && anyCar) {
      const toks = tokenize(raw);
      for (const o of interkomOffers)
        o.matchesAllWords = toks.length
          ? toks.every((tk) => (o.name || "").toLowerCase().includes(tk))
          : true;
    }

    if (!shatemOffers.length && !autotradeOffers.length && !interkomOffers.length) {
      // Nothing fast — Phaeton may still carry it, so the client keeps searching.
      logSearch(0);
      return NextResponse.json({
        ok: true,
        empty: true,
        query: raw,
        offers: [],
        ...(vinSteer ? { fitWarning: vinSteer } : {}),
        phaetonPending,
      });
    }

    const allOffers: PartOffer[] = [...shatemOffers, ...autotradeOffers, ...interkomOffers];

    // Итоговая цена — по диапазонам входящей цены (резерв — общая наценка).
    // До pick/sort, чтобы «дешевле» отражало реальную цену для клиента.
    for (const o of allOffers) o.priceFinal = priceFor(o);

    // Tokenize query for the words-AND filter (name search only).
    const queryTokens = kind === "name" ? tokenize(raw) : [];

    // Show ONLY what the customer asked for: Astana warehouses, in stock now.
    const wantsWords = kind === "name" && queryTokens.length > 0;
    const inAstanaStock = allOffers.filter(
      (o) => o.atAstana && o.inStockNow && (!wantsWords || o.matchesAllWords)
    );

    // Up to `analogsMax` distinct parts from EACH warehouse, deduped by part number.
    const picked = pickPerSource(inAstanaStock, analogsMax);

    if (!picked.length) {
      logSearch(0);
      return NextResponse.json({
        ok: true,
        empty: true,
        query: raw,
        offers: [],
        ...(vinSteer ? { fitWarning: vinSteer } : {}),
        phaetonPending,
      });
    }

    session.lastSearch = { kind, query: raw };
    await session.save();

    logSearch(picked.length);

    const offers = codeOffers(picked);

    // «Сопутствующие товары» — re-price by warehouse markup, drop anything
    // already shown in the main results, cap and code like the main offers.
    const RELATED_MAX = 8;
    const pickedKeys = new Set(picked.map(partKey));
    const relatedSeen = new Set<string>();
    const relatedPayload = autotradeRelated
      .map((o) => {
        o.priceFinal = priceFor(o);
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
    // hidden). "unconfirmed" = we can't confirm fit (loud banner, parts shown).
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
      kind === "article" && !anyCar && vehLabel && picked.length > 0 &&
      !picked.some((o) => o.compat === "match")
    ) {
      fitWarning = {
        ...vehLabel,
        level: picked.some((o) => o.compat === "mismatch") ? "mismatch" : "unconfirmed",
      };
    } else if (kind === "name" && !anyCar && vehLabel && !realVin && !ref && picked.length > 0) {
      // A car was chosen MANUALLY without the catalog — matches aren't verified.
      fitWarning = { ...vehLabel, level: "unconfirmed", needsVin: true };
    }

    // Оригинальный (OEM) номер = ЗАВОДСКОЙ номер для выбранного авто, из
    // VIN-каталога Laximo (Shate-M) — доступен при поиске по названию.
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
      phaetonPending,
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
