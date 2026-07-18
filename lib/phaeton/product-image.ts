/**
 * Публичный URL фото товара из каталога shop.phaeton.kz.
 *
 * Разведано: страница товара за логином, но сами файлы картинок ПУБЛИЧНЫ
 * (как у Autotrade) и лежат по предсказуемому пути:
 *   https://shop.phaeton.kz/ProductsImages/<БРЕНД>/<АРТИКУЛ>.JPG
 * Фото студийные, высокого разрешения, с брендом производителя — без надписей
 * поставщика. Ключ — бренд+артикул, есть у каждого оффера. Логин в рантайме
 * не нужен.
 */
const SHOP = (process.env.PHAETON_SHOP_BASE || "https://shop.phaeton.kz").replace(/\/+$/, "");

/** Публичная ссылка на фото или null, если бренд/артикул пустой. */
export function phaetonImageUrl(article: string, brand?: string): string | null {
  // Phaeton в имени файла убирает дефисы/пробелы из артикула
  // (напр. «AP-89» → «AP89.JPG»), поэтому нормализуем так же.
  const a = article.trim().replace(/[\s-]/g, "");
  const b = (brand ?? "").trim();
  if (!a || !b) return null;
  return `${SHOP}/ProductsImages/${encodeURIComponent(b)}/${encodeURIComponent(a)}.JPG`;
}
