import { getImageRows } from "@/lib/content";
import { cldUrl } from "@/lib/cloudinary-url";

/**
 * Фото деталей. Источник — существующая система картинок (Cloudinary + лист
 * ContentImages): фото хранится как слот с префиксом `part:` + артикул,
 * например `part:41060EG090`. Так переиспользуется вся инфраструктура —
 * загрузка, CDN, кэш, ревалидация — без новых таблиц.
 *
 * Поставщики чистого фото товара нам не отдают (проверено: Phaeton PhotoItem
 * пустой, у Shate-M поля нет, Autotrade с вотермаркой). Поэтому фото —
 * ручное (владелец грузит) или из внешней OEM-базы (TecDoc, если задан ключ).
 * Autotrade-картинки не используются вообще, так что вотермарки перекупщика
 * тут появиться неоткуда.
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
