import { searchArticles, getArticleWithContents, searchContent } from "./client";

const norm = (s: string) => s.toUpperCase().replace(/[\s-]/g, "");

/**
 * Фото/схема детали по её артикулу через каталог Shate-M. Картинки заводские
 * (бренд производителя — Nissan/MANN/…), надписей поставщика на них нет, так
 * что показывать можно на любом языке. Поиск идёт по КОДУ детали, а не по
 * складу, поэтому фото находится и для офферов других поставщиков.
 *
 * Возвращает data-URI (`data:image/webp;base64,…`) или null, если фото нет.
 * Полностью fail-safe: любая ошибка Shate-M → null (вызывающий подставит логотип).
 */
export async function resolvePartImageDataUri(
  code: string,
  brand?: string
): Promise<string | null> {
  const hits = await searchArticles(code).catch(() => []);
  if (!hits.length) return null;

  // Среди тёзок по коду берём совпадение по бренду, иначе первый.
  const picked =
    (brand && hits.find((h) => norm(h.article.tradeMarkName ?? "") === norm(brand))) ||
    hits[0];

  const full = await getArticleWithContents(picked.article.id).catch(() => null);
  const content =
    full?.contents?.find((c) => (c.contentType ?? "").startsWith("Image")) ??
    full?.contents?.[0];
  if (!content) return null;

  const res = await searchContent(content.contentId).catch(() => []);
  const value = res?.[0]?.value;
  return value && value.startsWith("data:") ? value : null;
}

/** Пошаговая диагностика резолва (для админ-debug маршрута part-photo). */
export async function resolvePartImageDebug(
  code: string,
  brand?: string
): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = { code, brand };
  try {
    const hits = await searchArticles(code);
    out.hits = hits.length;
    out.hitBrands = hits.map((h) => h.article.tradeMarkName).slice(0, 8);
    if (!hits.length) return out;
    const picked =
      (brand && hits.find((h) => norm(h.article.tradeMarkName ?? "") === norm(brand))) ||
      hits[0];
    out.pickedId = picked.article.id;
    out.pickedBrand = picked.article.tradeMarkName;
    const full = await getArticleWithContents(picked.article.id);
    out.contents = (full.contents ?? []).map((c) => c.contentType);
    const content =
      full.contents?.find((c) => (c.contentType ?? "").startsWith("Image")) ??
      full.contents?.[0];
    if (!content) return out;
    out.contentId = content.contentId.slice(0, 12) + "…";
    const res = await searchContent(content.contentId);
    const value = res?.[0]?.value ?? "";
    out.gotDataUri = value.startsWith("data:");
    out.valuePrefix = value.slice(0, 30);
    out.valueLen = value.length;
  } catch (err) {
    out.error = (err as Error).message;
  }
  return out;
}
