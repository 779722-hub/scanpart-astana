import { fetch as undiciFetch, ProxyAgent } from "undici";
import * as cheerio from "cheerio";
import { LRUCache } from "lru-cache";

/**
 * Точечный прокси к autodoc.ru — тянем HTML страниц поиска / продукта,
 * вытаскиваем (Brand, Article, Name) и кешируем на 24 часа. Падение
 * автодока никогда не должно валить наш поиск: на любую ошибку отдаём
 * пустой массив и падаем в обычный Phaeton-флоу.
 */

export interface AutodocPart {
  article: string;
  brand: string;
  name: string;
  /** absolute URL обратно в autodoc — для отладки/будущих ссылок */
  source?: string;
}

const TIMEOUT_MS = 7_000;
const cache = new LRUCache<string, AutodocPart[]>({
  max: 500,
  ttl: 24 * 60 * 60 * 1000, // 24 h
});

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";

let _proxyAgent: ProxyAgent | null = null;
function proxyAgent(): ProxyAgent | undefined {
  // По умолчанию используем тот же фиксированный IP что и для Phaeton
  // (Proxy6) — иначе при работе на Vercel мы будем стучаться с разных
  // адресов, что повышает шанс на бан со стороны Cloudflare.
  const url = process.env.AUTODOC_PROXY_URL || process.env.PHAETON_PROXY_URL;
  if (!url) return undefined;
  if (!_proxyAgent) _proxyAgent = new ProxyAgent(url);
  return _proxyAgent;
}

async function fetchHtml(url: string): Promise<{ html: string; status: number }> {
  const ctrl = new AbortController();
  const tm = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const headers: Record<string, string> = {
      "user-agent": UA,
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "ru-RU,ru;q=0.9,en;q=0.8",
      "cache-control": "no-cache",
      pragma: "no-cache",
      "upgrade-insecure-requests": "1",
    };
    const dispatcher = proxyAgent();
    const res = dispatcher
      ? await undiciFetch(url, { headers, signal: ctrl.signal, dispatcher, redirect: "follow" })
      : await fetch(url, { headers, signal: ctrl.signal, cache: "no-store", redirect: "follow" });
    const html = await res.text();
    return { html, status: res.status };
  } finally {
    clearTimeout(tm);
  }
}

/**
 * Достаём (brand, article, name) из произвольной HTML-страницы autodoc.
 * Несколько слоёв стратегий — чем дальше, тем грубее, чтобы устоять при
 * перевёрстке сайта.
 */
function extractPartsFromHtml(html: string, sourceUrl: string): AutodocPart[] {
  const found: AutodocPart[] = [];
  const seen = new Set<string>();
  const push = (brand: string, article: string, name: string) => {
    const b = brand.trim();
    const a = article.trim().replace(/\s+/g, "");
    const n = name.trim().replace(/\s+/g, " ");
    if (!b || !a || !n) return;
    const key = `${b}|${a}`.toUpperCase();
    if (seen.has(key)) return;
    seen.add(key);
    found.push({ brand: b, article: a, name: n, source: sourceUrl });
  };

  let $: cheerio.CheerioAPI;
  try {
    $ = cheerio.load(html);
  } catch {
    return found;
  }

  // Strategy 1: schema.org Product (itemprop / itemtype)
  $("[itemtype*='Product'], [itemtype*='product']").each((_, el) => {
    const $el = $(el);
    const brand =
      $el.find("[itemprop='brand'] [itemprop='name']").first().text() ||
      $el.find("[itemprop='brand']").first().text() ||
      $el.find("[itemprop='manufacturer']").first().text();
    const article =
      $el.find("[itemprop='mpn']").first().text() ||
      $el.find("[itemprop='sku']").first().text() ||
      $el.find("[itemprop='productID']").first().text();
    const name = $el.find("[itemprop='name']").first().text();
    push(brand, article, name);
  });

  // Strategy 2: data-* атрибуты (используют многие листинги autodoc)
  $("[data-article][data-brand], [data-article][data-brand-name]").each((_, el) => {
    const $el = $(el);
    const brand = $el.attr("data-brand") || $el.attr("data-brand-name") || "";
    const article = $el.attr("data-article") || "";
    const name =
      $el.attr("data-name") ||
      $el.find("a, .name, .title, h2, h3, h4").first().text() ||
      "";
    push(brand, article, name);
  });

  // Strategy 3: типичные карточки товара
  const cardSelectors = [
    ".product-item",
    ".product-card",
    ".search-item",
    ".search-result-item",
    ".search-results__item",
    ".item-product",
    ".catalog__item",
    ".catalog-item",
    ".goods-item",
    "tr.row",
  ];
  $(cardSelectors.join(",")).each((_, el) => {
    const $el = $(el);
    const brand =
      $el.find(".brand, [class*='brand'], .manufacturer").first().text() ||
      $el.attr("data-brand") ||
      "";
    const article =
      $el.find(".article, .article-num, .part-number, [class*='article']").first().text() ||
      $el.attr("data-article") ||
      "";
    const name = $el.find(".name, .title, h2, h3, h4, a.product-link").first().text() || "";
    push(brand, article, name);
  });

  // Strategy 4: парные регулярки — самая грубая, на крайний случай.
  // Ищем JSON-блоки вида {"brand":"X","article":"Y","name":"Z"}.
  const jsonRe =
    /["']brand["']\s*:\s*["']([^"']{1,40})["'][^{}]{0,200}?["']article["']\s*:\s*["']([^"']{1,40})["'][^{}]{0,400}?["']name["']\s*:\s*["']([^"']{1,200})["']/gi;
  let m: RegExpExecArray | null;
  let regexHits = 0;
  while ((m = jsonRe.exec(html)) !== null && regexHits < 30) {
    push(m[1], m[2], m[3]);
    regexHits++;
  }

  return found;
}

/** Похоже ли что нас остановил Cloudflare/JS-челлендж. */
function looksLikeChallenge(html: string): boolean {
  const head = html.slice(0, 5000).toLowerCase();
  return (
    head.includes("cloudflare") &&
    (head.includes("checking your browser") ||
      head.includes("just a moment") ||
      head.includes("cf-browser-verification") ||
      head.includes("cf-chl-bypass"))
  );
}

interface FindResult {
  parts: AutodocPart[];
  status: number;
  challenge: boolean;
  triedUrls: string[];
}

/**
 * Ищем (brand, article) по тексту запроса (опционально с маркой/моделью).
 * Перебираем несколько URL-форм поиска autodoc — берём первый ответ,
 * из которого удалось вытянуть карточки.
 */
export async function findArticles(
  query: string,
  vehicle?: { make?: string; model?: string }
): Promise<FindResult> {
  const cacheKey = JSON.stringify({
    q: query.toLowerCase(),
    mk: (vehicle?.make ?? "").toLowerCase(),
    md: (vehicle?.model ?? "").toLowerCase(),
  });
  const cached = cache.get(cacheKey);
  if (cached) {
    return { parts: cached, status: 200, challenge: false, triedUrls: ["[cache]"] };
  }

  const variants: string[] = [];
  if (vehicle?.make) {
    if (vehicle.model && vehicle.model !== "—") {
      variants.push(`${query} ${vehicle.make} ${vehicle.model}`);
    }
    variants.push(`${query} ${vehicle.make}`);
  }
  variants.push(query);

  const urlsFor = (q: string): string[] => {
    const enc = encodeURIComponent(q);
    return [
      `https://www.autodoc.ru/search?q=${enc}`,
      `https://www.autodoc.ru/search.php?searchstring=${enc}`,
      `https://www.autodoc.ru/products?searchTerm=${enc}`,
    ];
  };

  const triedUrls: string[] = [];
  let lastStatus = 0;
  let challenge = false;

  for (const variant of variants) {
    for (const url of urlsFor(variant)) {
      triedUrls.push(url);
      try {
        const { html, status } = await fetchHtml(url);
        lastStatus = status;
        if (status >= 400) continue;
        if (looksLikeChallenge(html)) {
          challenge = true;
          continue;
        }
        const parts = extractPartsFromHtml(html, url).slice(0, 12);
        if (parts.length) {
          cache.set(cacheKey, parts);
          return { parts, status, challenge, triedUrls };
        }
      } catch (err) {
        console.warn(
          `[autodoc] ${url} failed:`,
          (err as Error).message.slice(0, 120)
        );
      }
    }
  }

  return { parts: [], status: lastStatus, challenge, triedUrls };
}
