import { unstable_cache } from "next/cache";
import { shopGetHtml, phaetonShopConfigured } from "./shop-session";
import { getSetting } from "@/lib/sheets/settings";

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
      // Скидочная цена — в data-artificial-price (если >0), иначе обычная
      // data-price; data-original-price — старая (для зачёркивания и %).
      const artificial = toNum(/data-artificial-price="([^"]*)"/i.exec(rowHtml)?.[1]);
      const orig = toNum(/data-original-price="([^"]*)"/i.exec(rowHtml)?.[1]);
      const priceRaw = artificial > 0 ? artificial : toNum(r[1]);
      if (priceRaw <= 0) continue;
      items.push({
        brand,
        article,
        name: name || article,
        applicability,
        make: firstMake(applicability),
        priceRaw,
        oldPrice: orig > priceRaw ? orig : null,
        deliveryDays: toNum(r[2]),
        available: toNum(r[3]),
      });
      break; // одна строка Астаны на товар
    }
  }
  return items;
}

const CONCURRENCY = 8;
const PAGES_DEFAULT = 40;
// Каждая страница SaleOut тянется ~несколько секунд; выше ~60 страниц холодный
// скрейп рискует превысить maxDuration. Полный список (~979 стр.) — только
// фоновой синхронизацией, не в запросе.
const PAGES_MAX = 60;

async function fetchOnePage(page: number): Promise<SaleItem[]> {
  const { status, html } = await shopGetHtml(`/ru-RU/SaleOut?page=${page}`).catch(() => ({
    status: 0,
    html: "",
  }));
  if (status !== 200 || /Account\/Login/i.test(html)) return [];
  return parseSaleOut(html);
}

/**
 * Скрейпим первые N страниц SaleOut (по настройке), параллельно батчами.
 * Весь список — ~979 страниц (~5800 позиций Астаны), целиком вживую нельзя;
 * N ограничивает объём. Дедуп по бренд+артикул.
 */
async function fetchSaleAstana(pages: number): Promise<SaleItem[]> {
  if (!phaetonShopConfigured()) return [];
  const nums = Array.from({ length: pages }, (_, i) => i + 1);
  const all: SaleItem[] = [];
  for (let i = 0; i < nums.length; i += CONCURRENCY) {
    const batch = nums.slice(i, i + CONCURRENCY);
    const lists = await Promise.all(batch.map((p) => fetchOnePage(p).catch(() => [])));
    for (const l of lists) all.push(...l);
    // Пустой батч (кончились страницы / разлогин) — дальше нет смысла.
    if (lists.every((l) => l.length === 0) && i > 0) break;
  }
  const seen = new Set<string>();
  return all.filter((it) => {
    const k = `${it.brand}|${it.article}`.toUpperCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

const cachedSale = unstable_cache(
  async (pages: number) => fetchSaleAstana(pages).catch(() => [] as SaleItem[]),
  ["phaeton-sale-astana"],
  { revalidate: 3 * 3600, tags: ["sale"] }
);

/** Сколько страниц SaleOut сканировать (админка `sale_pages`, дефолт 40). */
export async function getSaleAstana(): Promise<SaleItem[]> {
  const raw = Number((await getSetting("sale_pages").catch(() => "")) ?? "");
  const pages = Number.isFinite(raw) && raw >= 1 ? Math.min(Math.floor(raw), PAGES_MAX) : PAGES_DEFAULT;
  return cachedSale(pages);
}
