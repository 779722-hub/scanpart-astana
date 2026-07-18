import { unstable_cache } from "next/cache";
import { shopGetHtml, phaetonShopConfigured } from "./shop-session";

/**
 * Раздел «Распродажа» из shop.phaeton.kz (/ru-RU/SaleOut) — скидочные товары.
 * Скрейпим таблицу за нашей веб-сессией, берём ТОЛЬКО строку склада Астана,
 * нормализуем. Источник для клиента скрыт (данные отдаёт наш /api/sale).
 */

export interface SaleItem {
  brand: string;
  article: string;
  name: string;
  applicability: string; // «Honda Accord (98-01); CR-V (95-02)»
  make: string; // первая марка из применимости — для сортировки/фильтра
  priceRaw: number; // цена со скидкой (до нашей наценки)
  oldPrice: number | null; // старая цена (если выше) — для показа скидки
  deliveryDays: number;
  available: number;
}

const clean = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#\d+;/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const toNum = (s: string | undefined): number =>
  Number((s ?? "").replace(/[^\d]/g, "")) || 0;

/** Первая марка авто из строки применимости (для сортировки «по марке»). */
function firstMake(applicability: string): string {
  const m = /^[A-ZА-ЯЁ][A-Za-zА-Яа-яЁё-]+/.exec(applicability.trim());
  return (m?.[0] ?? "").toUpperCase();
}

function parseSaleOut(html: string): SaleItem[] {
  const items: SaleItem[] = [];
  const tableRe = /<table class="table offers-table"([^>]*)>([\s\S]*?)<\/table>/gi;
  let t: RegExpExecArray | null;
  while ((t = tableRe.exec(html))) {
    const attrs = t[1];
    const body = t[2];
    const at = t.index;

    // Шапка товара — в ~1000 символах перед таблицей: Details-ссылка, название, применимость.
    const before = html.slice(Math.max(0, at - 1100), at);
    const det = /Details\?article=([^&"]+)&(?:amp;)?brand=([^"&]+)/i.exec(before);
    // Параметры ссылки URL-кодированы (WK8019%2F1, 714%20137%200003) — декодируем.
    const dec = (s: string) => {
      try {
        return decodeURIComponent(s);
      } catch {
        return s;
      }
    };
    let brand = /data-brand-title="([^"]*)"/i.exec(attrs)?.[1] ?? (det ? dec(det[2]) : "");
    let article = det ? dec(det[1]) : (/data-article="([^"]*)"/i.exec(attrs)?.[1] ?? "").toUpperCase();
    brand = clean(brand);
    article = clean(article);
    if (!brand || !article) continue;

    // Текстовые <div> в шапке: предпоследний — название, последний — применимость.
    const divs = Array.from(before.matchAll(/<div>\s*([^<][^]*?)<\/div>/gi), (d) => clean(d[1])).filter(Boolean);
    let name = divs.length >= 2 ? divs[divs.length - 2] : divs[0] ?? "";
    const applicability = divs.length >= 1 ? divs[divs.length - 1] : "";
    // Убрать дублирующий префикс бренда/служебные метки из названия.
    name = name.replace(new RegExp(`^_?[A-ZА-ЯЁ]{2,5}\\s+`, "i"), "").trim();
    name = name.replace(new RegExp(`^${brand}\\s+`, "i"), "").trim() || name;

    // Строка склада Астана внутри таблицы наличия.
    const rowRe = /<tr[^>]*\bdata-price="([^"]*)"[^>]*\bdata-delivery="([^"]*)"[^>]*\bdata-availability="([^"]*)"[^>]*>([\s\S]*?)<\/tr>/gi;
    let r: RegExpExecArray | null;
    while ((r = rowRe.exec(body))) {
      const rowHtml = r[4];
      const city = clean(/<td>\s*([^<]+?)\s*<\/td>/i.exec(rowHtml)?.[1] ?? "");
      if (!/астана/i.test(city)) continue;
      const priceRaw = toNum(r[1]);
      if (priceRaw <= 0) continue;
      const oldRaw = toNum(/data-original-price="([^"]*)"/i.exec(rowHtml)?.[1]);
      items.push({
        brand,
        article,
        name: name || article,
        applicability,
        make: firstMake(applicability),
        priceRaw,
        oldPrice: oldRaw > priceRaw ? oldRaw : null,
        deliveryDays: toNum(r[2]),
        available: toNum(r[3]),
      });
      break; // одна строка Астаны на товар
    }
  }
  return items;
}

async function fetchSaleAstana(): Promise<SaleItem[]> {
  if (!phaetonShopConfigured()) return [];
  const { status, html } = await shopGetHtml("/ru-RU/SaleOut");
  if (status !== 200 || /Account\/Login/i.test(html)) return [];
  return parseSaleOut(html);
}

/** Кэш на 1 час — распродажа меняется не часто, скрейп тяжёлый. */
export const getSaleAstana = unstable_cache(
  async () => fetchSaleAstana().catch(() => [] as SaleItem[]),
  ["phaeton-sale-astana"],
  { revalidate: 3600, tags: ["sale"] }
);
