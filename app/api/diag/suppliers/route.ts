import { NextRequest, NextResponse } from "next/server";
import { searchBrands, getDictionary } from "@/lib/phaeton/client";
import { getAstanaWarehouseIds } from "@/lib/phaeton/astana-warehouse";
import {
  searchArticles,
  getContext,
  searchPricesWithArticleInfo,
} from "@/lib/shatem/client";
import { searchShatemOffers } from "@/lib/shatem/search";
import { searchAutotradeOffers } from "@/lib/autotrade/search";
import { autotradeConfigured } from "@/lib/autotrade/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ВРЕМЕННЫЙ диагностический маршрут. Прогоняет всех трёх поставщиков в
// прод-окружении (с прод-env и прод-прокси) и отдаёт по каждому статус, число
// офферов и текст ошибки. Закрыт секретом в query (?t=...). Удалить после
// диагностики.
const SECRET = "4d9cbbaf89d05aa68fd9c766e6c50ac7";

// Не даём утечь секретам в текстах ошибок.
function mask(msg: string): string {
  let s = msg;
  for (const name of [
    "PHAETON_API_KEY",
    "PHAETON_USER_GUID",
    "PHAETON_CONTRAGENT_GUID",
    "PHAETON_PROXY_URL",
    "AUTOTRADE_PROXY_URL",
    "SHATEM_API_KEY",
    "AUTOTRADE_PASSWORD",
    "AUTOTRADE_LOGIN",
  ]) {
    const v = process.env[name];
    if (v && v.length > 3) s = s.split(v).join(`***${name}***`);
  }
  return s;
}

async function timed<T>(fn: () => Promise<T>) {
  const t0 = Date.now();
  try {
    const value = await fn();
    return { ok: true as const, ms: Date.now() - t0, value };
  } catch (err) {
    return {
      ok: false as const,
      ms: Date.now() - t0,
      error: mask((err as Error).message).slice(0, 400),
    };
  }
}

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get("t") !== SECRET) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const q = (req.nextUrl.searchParams.get("q") ?? "0986424815").trim();

  const env = {
    PHAETON_API_KEY: Boolean(process.env.PHAETON_API_KEY),
    PHAETON_USER_GUID: Boolean(process.env.PHAETON_USER_GUID),
    PHAETON_CONTRAGENT_GUID: Boolean(process.env.PHAETON_CONTRAGENT_GUID),
    PHAETON_PROXY_URL: Boolean(process.env.PHAETON_PROXY_URL),
    PHAETON_ASTANA_WAREHOUSE_ID: Boolean(process.env.PHAETON_ASTANA_WAREHOUSE_ID),
    SHATEM_API_KEY: Boolean(process.env.SHATEM_API_KEY),
    SHATEM_BASE_URL: process.env.SHATEM_BASE_URL || "(default)",
    AUTOTRADE_LOGIN: Boolean(process.env.AUTOTRADE_LOGIN),
    AUTOTRADE_PASSWORD: Boolean(process.env.AUTOTRADE_PASSWORD),
    AUTOTRADE_SESSION_COOKIE: Boolean(process.env.AUTOTRADE_SESSION_COOKIE),
    AUTOTRADE_PROXY_URL: Boolean(process.env.AUTOTRADE_PROXY_URL),
  };

  // --- Phaeton ---
  const phaetonWarehouses = await timed(() => getAstanaWarehouseIds());
  const phaetonDict = await timed(async () => {
    const d = await getDictionary();
    return { warehouses: Array.isArray(d.Warehouses) ? d.Warehouses.length : 0 };
  });
  const phaetonBrands = await timed(async () => {
    const r = await searchBrands(q);
    return { isError: r.IsError, items: (r.Items ?? []).length };
  });

  // --- Shate-M ---
  const shatemArticles = await timed(async () => {
    const hits = await searchArticles(q);
    return { hits: hits.length, first: hits[0]?.article?.id ?? null };
  });
  const shatemContext = await timed(() => getContext());
  const shatemPrices = await timed(async () => {
    const hits = await searchArticles(q);
    if (!hits.length) return { note: "no article hits", groups: 0 };
    const ctx = await getContext();
    const groups = await searchPricesWithArticleInfo([
      {
        articleId: hits[0].article.id,
        agreementCode: ctx.agreementCode,
        deliveryAddressCode: ctx.deliveryAddressCode,
        includeAnalogs: true,
      },
    ]);
    const priceRows = groups.reduce((n, g) => n + (g.prices?.length ?? 0), 0);
    return { groups: groups.length, priceRows };
  });
  const shatemOffers = await timed(async () => {
    const offers = await searchShatemOffers(q, { markupPct: 0 });
    return { offers: offers.length };
  });

  // --- Autotrade ---
  const autotrade = await timed(async () => {
    if (!autotradeConfigured()) return { configured: false, offers: 0 };
    const offers = await searchAutotradeOffers(q, { markupPct: 0 });
    return { configured: true, offers: offers.length };
  });

  return NextResponse.json({
    ok: true,
    query: q,
    env,
    phaeton: { warehouses: phaetonWarehouses, dictionary: phaetonDict, brands: phaetonBrands },
    shatem: {
      articles: shatemArticles,
      context: shatemContext,
      prices: shatemPrices,
      offers: shatemOffers,
    },
    autotrade,
  });
}
