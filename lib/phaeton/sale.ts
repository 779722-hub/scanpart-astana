import { unstable_cache } from "next/cache";
import { shopGetHtml, phaetonShopConfigured } from "./shop-session";
import {
  readSaleCache,
  clearSaleCache,
  appendSaleCache,
  ensureSheetStructure,
  writeSetting,
  readSetting,
} from "@/lib/sheets/client";

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

// Белый список автомарок — марку показываем ТОЛЬКО если она отсюда, иначе
// пусто (в применимости бывает мусор: «РРРРРРРР», коды, «адаптер» и т.п.).
const CAR_MAKES = new Set([
  "TOYOTA", "LEXUS", "SCION", "DAIHATSU", "HONDA", "ACURA", "NISSAN", "INFINITI",
  "DATSUN", "MAZDA", "MITSUBISHI", "SUBARU", "SUZUKI", "ISUZU", "HYUNDAI", "KIA",
  "GENESIS", "SSANGYONG", "DAEWOO", "CHEVROLET", "CHEVY", "CADILLAC", "BUICK",
  "GMC", "PONTIAC", "SATURN", "HUMMER", "FORD", "LINCOLN", "MERCURY", "DODGE",
  "CHRYSLER", "JEEP", "RAM", "PLYMOUTH", "VOLKSWAGEN", "VW", "AUDI", "PORSCHE",
  "SEAT", "SKODA", "BMW", "MINI", "MERCEDES", "MERCEDES-BENZ", "MB", "SMART",
  "MAYBACH", "OPEL", "VAUXHALL", "RENAULT", "DACIA", "ALPINE", "PEUGEOT",
  "CITROEN", "DS", "FIAT", "ALFA", "ALFAROMEO", "LANCIA", "ABARTH", "FERRARI",
  "MASERATI", "LAMBORGHINI", "VOLVO", "SAAB", "JAGUAR", "LANDROVER", "LAND",
  "RANGEROVER", "ROVER", "MG", "BENTLEY", "ROLLSROYCE", "ASTONMARTIN", "LOTUS",
  "MCLAREN", "TESLA", "GEELY", "CHERY", "HAVAL", "GREATWALL", "GWM", "BYD",
  "LIFAN", "JAC", "FAW", "CHANGAN", "DONGFENG", "ZOTYE", "BRILLIANCE", "BAIC",
  "GAC", "EXEED", "OMODA", "JAECOO", "TANK", "LADA", "VAZ", "ВАЗ", "GAZ", "ГАЗ",
  "UAZ", "УАЗ", "ZAZ", "ЛАДА", "MOSKVICH", "МОСКВИЧ", "TATA", "MAHINDRA",
  "PROTON", "PERODUA", "IRAN", "IKCO", "SCANIA", "MAN", "IVECO", "DAF", "MACK",
  "KENWORTH", "FREIGHTLINER", "HINO", "FUSO", "KAMAZ", "КАМАЗ", "MAZ", "МАЗ",
]);

// Схлопываем разные формы одной марки в одну.
const MAKE_CANON: Record<string, string> = {
  VW: "VOLKSWAGEN",
  MB: "MERCEDES-BENZ",
  MERCEDES: "MERCEDES-BENZ",
  LAND: "LANDROVER",
  RANGEROVER: "LANDROVER",
  CHEVY: "CHEVROLET",
  ALFA: "ALFAROMEO",
  VAZ: "ВАЗ",
  GWM: "GREATWALL",
};

/** Первая ЗНАКОМАЯ марка авто из применимости (канонизированная), иначе пусто. */
function firstMake(applicability: string): string {
  const tokens = applicability.toUpperCase().split(/[^A-ZА-ЯЁ0-9-]+/).filter(Boolean);
  for (const raw of tokens) {
    const base = CAR_MAKES.has(raw) ? raw : raw.split("-")[0]; // «HYUNDAI-KIA» → «HYUNDAI»
    if (base && CAR_MAKES.has(base)) return MAKE_CANON[base] ?? base;
  }
  return "";
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
const SYNC_CHUNK = 40; // страниц за один прогон синка
const SYNC_MAX_PAGE = 1000; // страховка (весь список ~979 стр.)

async function fetchOnePage(page: number): Promise<SaleItem[]> {
  const { status, html } = await shopGetHtml(`/ru-RU/SaleOut?page=${page}`).catch(() => ({
    status: 0,
    html: "",
  }));
  if (status !== 200 || /Account\/Login/i.test(html)) return [];
  return parseSaleOut(html);
}

/** Скрейпим диапазон страниц [start, start+count) параллельно батчами. */
async function fetchPagesRange(start: number, count: number): Promise<SaleItem[]> {
  const nums = Array.from({ length: count }, (_, i) => start + i);
  const all: SaleItem[] = [];
  for (let i = 0; i < nums.length; i += CONCURRENCY) {
    const batch = nums.slice(i, i + CONCURRENCY);
    const lists = await Promise.all(batch.map((p) => fetchOnePage(p).catch(() => [])));
    for (const l of lists) all.push(...l);
    if (lists.every((l) => l.length === 0)) break; // дальше страниц нет
  }
  return all;
}

/**
 * Один прогон фоновой синхронизации: скрейпит SYNC_CHUNK страниц от курсора и
 * дописывает в лист SaleCache. Курсор (страница) хранится в настройках. При
 * курсоре 1 лист очищается (начало нового цикла). Дойдя до конца/пустой
 * страницы — курсор сбрасывается на 1. Так покрытие дорастает до полного за
 * несколько прогонов (крон + кнопка «Обновить»), независимо от лимитов запроса.
 */
export async function syncSaleChunk(): Promise<{
  from: number;
  scraped: number;
  next: number;
}> {
  if (!phaetonShopConfigured()) return { from: 0, scraped: 0, next: 1 };
  await ensureSheetStructure().catch(() => {});
  // Курсор читаем НАПРЯМУЮ (не через кэш getSetting 60с), иначе быстрые прогоны
  // видят старое значение и топчутся на первых страницах.
  const settings = await readSetting().catch(() => ({}) as Record<string, string>);
  const cur = Math.max(1, Number(settings.sale_sync_cursor) || 1);
  const items = await fetchPagesRange(cur, SYNC_CHUNK);
  if (cur <= 1) await clearSaleCache().catch(() => {});
  await appendSaleCache(
    items.map((it) => [
      it.brand, it.article, it.name, it.applicability, it.make,
      it.priceRaw, it.oldPrice ?? "", it.deliveryDays, it.available,
    ])
  ).catch(() => {});
  let next = cur + SYNC_CHUNK;
  if (items.length === 0 || next > SYNC_MAX_PAGE) next = 1; // цикл завершён
  await writeSetting("sale_sync_cursor", String(next)).catch(() => {});
  await writeSetting("sale_sync_at", new Date().toISOString()).catch(() => {});
  return { from: cur, scraped: items.length, next };
}

/** Прочитать накопленную распродажу из листа + дедуп по бренд+артикул. */
const readCache = unstable_cache(
  async (): Promise<SaleItem[]> => {
    const rows = await readSaleCache().catch(() => [] as string[][]);
    const seen = new Set<string>();
    const out: SaleItem[] = [];
    for (const r of rows) {
      const brand = r[0] ?? "";
      const article = r[1] ?? "";
      if (!brand || !article) continue;
      const key = `${brand}|${article}`.toUpperCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const applicability = r[3] ?? "";
      out.push({
        brand,
        article,
        name: r[2] || article,
        applicability,
        // Марку пересчитываем по применимости (белый список), а не берём из
        // сохранённой колонки — так старые мусорные значения чинятся сразу.
        make: firstMake(applicability),
        priceRaw: Number(r[5]) || 0,
        oldPrice: r[6] ? Number(r[6]) || null : null,
        deliveryDays: Number(r[7]) || 0,
        available: Number(r[8]) || 0,
      });
    }
    return out;
  },
  ["phaeton-sale-cache"],
  { revalidate: 300, tags: ["sale"] }
);

/** Живой фолбэк, если лист пуст (синк ещё не прогонялся): первые 20 страниц. */
const liveFallback = unstable_cache(
  async () => fetchPagesRange(1, 20).catch(() => [] as SaleItem[]),
  ["phaeton-sale-live"],
  { revalidate: 1800, tags: ["sale"] }
);

/** Распродажа для /api/sale: из накопленного листа, иначе живой фолбэк. */
export async function getSaleAstana(): Promise<SaleItem[]> {
  const cached = await readCache();
  if (cached.length) return cached;
  const live = await liveFallback();
  const seen = new Set<string>();
  return live.filter((it) => {
    const k = `${it.brand}|${it.article}`.toUpperCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
