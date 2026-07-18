import { searchArticles, getArticleWithContents, searchContent } from "./client";

const norm = (s: string) => s.toUpperCase().replace(/[\s-]/g, "");

// Сколько карточек-тёзок (по коду) максимум опросить в поиске картинки.
const MAX_HITS_TO_TRY = 4;

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
  brand?: string,
  size = 400
): Promise<string | null> {
  const hits = await searchArticles(code).catch(() => []);
  if (!hits.length) return null;

  // Совпадение по бренду — вперёд; у части тёзок картинки нет, поэтому идём
  // по списку, пока не найдём карточку с изображением (с разумным лимитом).
  const ordered = brand
    ? [...hits].sort(
        (a, b) =>
          (norm(a.article.tradeMarkName ?? "") === norm(brand) ? 0 : 1) -
          (norm(b.article.tradeMarkName ?? "") === norm(brand) ? 0 : 1)
      )
    : hits;

  for (const h of ordered.slice(0, MAX_HITS_TO_TRY)) {
    const full = await getArticleWithContents(h.article.id).catch(() => null);
    const content =
      full?.contents?.find((c) => (c.contentType ?? "").startsWith("Image")) ??
      full?.contents?.[0];
    if (!content) continue;
    const res = await searchContent(content.contentId, size).catch(() => []);
    const value = res?.[0]?.value;
    if (value && value.startsWith("data:")) return value;
  }
  return null;
}
