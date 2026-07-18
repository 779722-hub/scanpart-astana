import { getImageRows } from "@/lib/content";
import { cldUrl } from "@/lib/cloudinary-url";

/**
 * Фото деталей. Источник — существующая система картинок (Cloudinary + лист
 * ContentImages): фото хранится как слот с префиксом `part:` + артикул,
 * например `part:41060EG090`. Так переиспользуется вся инфраструктура —
 * загрузка, CDN, кэш, ревалидация — без новых таблиц.
 *
 * Автоматический источник — каталог Shate-M (`/api/v1/articles/{id}` +
 * `/api/v1/contents/search`): заводское фото/схема по артикулу, бренд
 * производителя, без надписей поставщика. Резолвится лениво в маршруте
 * `/api/part-photo` (см. [[lib/shatem/images.ts]]). Ручной слот `part:` имеет
 * приоритет, а если фото нигде нет — подставляется логотип.
 */
const PART_SLOT_PREFIX = "part:";

/** Нормализация артикула под ключ: как в поиске (без пробелов/дефисов, upper). */
export function normPartKey(article: string): string {
  return article.toUpperCase().replace(/[\s\-]/g, "");
}

/** Карта нормализованный-артикул → URL фото. Кэш наследуется от getImageRows. */
export async function getPartPhotoMap(): Promise<Record<string, string>> {
  const rows = await getImageRows().catch(() => []);
  const map: Record<string, string> = {};
  for (const r of rows) {
    if (!r.publicId || !r.slot.startsWith(PART_SLOT_PREFIX)) continue;
    const key = normPartKey(r.slot.slice(PART_SLOT_PREFIX.length));
    if (key) map[key] = cldUrl(r.publicId, { width: 400 });
  }
  return map;
}

/** Слот для фото конкретного артикула. */
export function partPhotoSlot(article: string): string {
  return PART_SLOT_PREFIX + normPartKey(article);
}

/**
 * URL прокси-картинки детали для `<img src>`. Сам маршрут решает: ручной слот
 * `part:` → фото из каталога Shate-M по артикулу → наш логотип (фолбэк).
 * CDN Vercel кэширует ответ по этому URL, так что резолв идёт лениво и один раз.
 */
export function partPhotoUrl(article: string, brand?: string): string {
  const p = new URLSearchParams({ a: article });
  if (brand) p.set("b", brand);
  return `/api/part-photo?${p.toString()}`;
}
