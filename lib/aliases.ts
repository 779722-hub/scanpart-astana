import { LRUCache } from "lru-cache";
import { listAliases, type AliasRow } from "@/lib/sheets/client";

/**
 * Словарь синонимов для поиска по названию: пары (Brand, Article),
 * которые админ вручную сопоставил с типичными запросами клиентов.
 *
 * Phaeton не умеет искать по словам — здесь мы превращаем «колодки
 * передние» в список реальных парт-номеров, которые Phaeton уже
 * готов прайсить.
 */

export interface BrandArticle {
  brand: string;
  article: string;
}

const cache = new LRUCache<string, AliasRow[]>({ max: 1, ttl: 60_000 });

async function getAllAliases(): Promise<AliasRow[]> {
  const cached = cache.get("all");
  if (cached) return cached;
  try {
    const rows = await listAliases();
    cache.set("all", rows);
    return rows;
  } catch (err) {
    console.warn("[aliases] load failed:", (err as Error).message);
    return [];
  }
}

export function invalidateAliasCache(): void {
  cache.delete("all");
}

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

/**
 * Парсим колонку `articles` строки словаря. Поддерживаем оба разделителя
 * — запятую и перевод строки — чтобы админу было удобно.
 */
export function parseArticlesCell(raw: string): BrandArticle[] {
  const out: BrandArticle[] = [];
  const seen = new Set<string>();
  for (const piece of raw.split(/[,\n;]+/)) {
    const s = piece.trim();
    if (!s) continue;
    // Допускаем варианты: "BRAND|ARTICLE", "BRAND/ARTICLE", "BRAND ARTICLE".
    const m = s.match(/^(.+?)[|\/\s]+(.+)$/);
    if (!m) continue;
    const brand = m[1].trim();
    const article = m[2].trim().replace(/\s+/g, "");
    if (!brand || !article || article.length < 3) continue;
    const key = `${brand.toUpperCase()}|${article.toUpperCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ brand, article });
  }
  return out;
}

/**
 * Сопоставляем пользовательский запрос с записями словаря и возвращаем
 * перечень (Brand, Article) пар. Совпадение засчитывается, если все
 * токены alias.query содержатся в запросе пользователя (или наоборот),
 * а alias.make пуст ИЛИ совпадает с маркой авто пользователя.
 */
export async function findAliasMatches(
  userQuery: string,
  vehicleMake?: string
): Promise<BrandArticle[]> {
  const all = await getAllAliases();
  if (!all.length) return [];

  const userTokens = tokenize(userQuery);
  if (!userTokens.length) return [];
  const userText = userTokens.join(" ");
  const makeLower = (vehicleMake ?? "").toLowerCase().trim();

  const out: BrandArticle[] = [];
  const seen = new Set<string>();

  for (const row of all) {
    const aliasMakeLower = row.make.toLowerCase().trim();
    if (aliasMakeLower && makeLower && aliasMakeLower !== makeLower) continue;
    if (aliasMakeLower && !makeLower) {
      // Алиас привязан к марке, но у пользователя нет VIN — не подходит.
      continue;
    }

    const aliasTokens = tokenize(row.query);
    if (!aliasTokens.length) continue;
    const aliasText = aliasTokens.join(" ");
    // Двунаправленное substring-совпадение: «колодки» матчит «передние
    // колодки», и «передние колодки тормозные» матчит запись «колодки».
    const matches =
      userText.includes(aliasText) ||
      aliasText.includes(userText) ||
      aliasTokens.every((t) => userText.includes(t));
    if (!matches) continue;

    for (const ba of parseArticlesCell(row.articles)) {
      const key = `${ba.brand.toUpperCase()}|${ba.article.toUpperCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(ba);
    }
  }

  return out;
}
