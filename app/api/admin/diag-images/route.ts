import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { searchBrands, searchPrices } from "@/lib/phaeton/client";
import {
  searchArticles,
  searchPricesWithArticleInfo,
  getContext,
} from "@/lib/shatem/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * ВРЕМЕННЫЙ диагностический эндпоинт — удалить после разведки картинок.
 * Дёргает Shate-M и Phaeton на реальной детали и возвращает СЫРОЙ ответ +
 * автоматически найденные поля, похожие на URL картинки. Типы поставщиков
 * молча отбрасывают лишние поля, поэтому смотрим рантайм-объект целиком.
 *
 * GET /api/admin/diag-images?article=41060EG090
 */
function findImageish(obj: unknown, path = "", out: Record<string, string> = {}): Record<string, string> {
  if (typeof obj === "string") {
    const looksUrl = /^https?:\/\//i.test(obj);
    const looksImg = /\.(jpe?g|png|webp|gif|svg)(\?|$)/i.test(obj);
    const keyImg = /image|img|photo|picture|foto|thumb|preview/i.test(path);
    if ((looksUrl && (looksImg || keyImg)) || looksImg) out[path] = obj.slice(0, 200);
  } else if (Array.isArray(obj)) {
    obj.slice(0, 3).forEach((v, i) => findImageish(v, `${path}[${i}]`, out));
  } else if (obj && typeof obj === "object") {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      findImageish(v, path ? `${path}.${k}` : k, out);
    }
  }
  return out;
}

/** Все ключи объекта (первого элемента), чтобы увидеть, какие поля вообще есть. */
function keysOf(obj: unknown): string[] {
  if (Array.isArray(obj)) return obj.length ? Object.keys(obj[0] ?? {}) : [];
  if (obj && typeof obj === "object") return Object.keys(obj as object);
  return [];
}

export async function GET(req: NextRequest) {
  const guard = await requireAuth();
  if (guard instanceof NextResponse) return guard;

  const article = (req.nextUrl.searchParams.get("article") || "41060EG090").trim();
  const result: Record<string, unknown> = { article };

  // --- Phaeton ---
  try {
    const brands = await searchBrands(article);
    result.phaeton_brands_keys = keysOf(brands);
    const firstBrand =
      (Array.isArray(brands) ? brands : (brands as { Items?: unknown[] })?.Items ?? [])[0];
    const brandName =
      (firstBrand as { Brand?: string })?.Brand ?? "";
    const prices = brandName
      ? await searchPrices({ article, brand: brandName, includeAnalogs: true })
      : null;
    result.phaeton_prices_keys = keysOf(
      (prices as { Items?: unknown[] })?.Items ?? prices
    );
    result.phaeton_images = findImageish(prices);
    result.phaeton_first_price_item = ((prices as { Items?: unknown[] })?.Items ?? [])[0] ?? null;
  } catch (e) {
    result.phaeton_error = (e as Error).message;
  }

  // --- Shate-M ---
  try {
    const [hits, ctx] = await Promise.all([searchArticles(article), getContext()]);
    result.shatem_article_keys = keysOf(hits);
    result.shatem_first_article = (hits as unknown[])[0] ?? null;
    if (hits.length) {
      const groups = await searchPricesWithArticleInfo(
        hits.slice(0, 2).map((h) => ({
          articleId: h.article.id,
          agreementCode: ctx.agreementCode,
          deliveryAddressCode: ctx.deliveryAddressCode,
          includeAnalogs: true,
        }))
      );
      result.shatem_article_info = groups[0]?.article ?? null;
      result.shatem_images = findImageish(groups);
    }
  } catch (e) {
    result.shatem_error = (e as Error).message;
  }

  return NextResponse.json(result, {
    headers: { "cache-control": "no-store" },
  });
}
