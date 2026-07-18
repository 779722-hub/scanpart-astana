import { searchArticles, getArticleWithContents, searchContent } from "./client";

const norm = (s: string) => s.toUpperCase().replace(/[\s-]/g, "");

// Сколько карточек максимум опросить в поиске картинки.
const MAX_HITS_TO_TRY = 4;

/**
 * Совпадение брендов с допуском на суффиксы/формат (MANN ↔ MANN-FILTER).
 * Строгое равенство ИЛИ вхождение одного в другой (при длине ≥3, чтобы
 * короткие бренды не совпадали случайно).
 */
function brandMatches(a: string, b: string): boolean {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const short = x.length <= y.length ? x : y;
  const long = x.length <= y.length ? y : x;
  return short.length >= 3 && long.includes(short);
}

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

  // Один код может принадлежать РАЗНЫМ деталям у разных брендов (смазка и
  // стартер могут иметь одинаковый код). Показываем фото, только когда товар
  // определён однозначно: либо бренд совпал, либо по коду единственный хит.
  // Иначе не угадываем — вернём null (вызывающий подставит логотип).
  const matched = brand
    ? hits.filter((h) => brandMatches(h.article.tradeMarkName ?? "", brand))
    : [];
  let candidates: typeof hits;
  if (matched.length) candidates = matched;
  else if (hits.length === 1) candidates = hits;
  else return null;

  for (const h of candidates.slice(0, MAX_HITS_TO_TRY)) {
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
