import { fetch as undiciFetch, ProxyAgent } from "undici";
import { resolveProxyUrl } from "@/lib/proxy";
import type {
  PhaetonBrandsResponse,
  PhaetonDictionaryResponse,
  PhaetonPricesResponse,
} from "./types";

// 10s: приоритет — быстрая выдача (только Астана + в наличии, ~3.5с). Тёплое
// соединение (его держит /api/cron/warm) отдаёт даже большой ответ цен за
// ~2-3с, так что Phaeton успевает и попадает в выдачу. Гнаться за холодным
// соединением большим таймаутом смысла нет — это делало поиск медленным, а
// сам огромный ответ Phaeton по API не ужать (Sources/includeAnalogs не
// фильтруют). Ретрая на таймаут нет: холодный вызов просто не блокирует поиск.
const DEFAULT_TIMEOUT = 10_000;
const RETRY_ATTEMPTS = 2; // initial + 1 retry on transient failure
const RETRY_DELAY_MS = 600;

function isTransient(err: Error): boolean {
  const m = err.message;
  return (
    /ECONN|ENOTFOUND|EAI_AGAIN|fetch failed|socket hang up/i.test(m) ||
    /\b5\d\d\b/.test(m) // any 5xx upstream
  );
}

// Our own AbortController firing means the call already ran the full timeout —
// retrying just doubles the wall for a call that won't return quickly, so we
// never retry an abort/timeout (only fast-failing connection errors above).
function isAbort(err: Error): boolean {
  return err.name === "AbortError" || /abort|timed?\s*out/i.test(err.message);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Phaeton requires a static IP whitelist. On Vercel egress IPs are random,
 * so we route Phaeton calls through a fixed-IP proxy (e.g. Fixie). Configure
 * via env: PHAETON_PROXY_URL=http://user:pass@proxy.host:port
 *
 * NOTE: We use `undici.fetch` (not the global fetch). On Vercel the global
 * fetch implementation can ignore the `dispatcher` option, so we call the
 * raw undici fetch which always honors it.
 */
let _proxyAgent: ProxyAgent | null = null;
function proxyAgent(): ProxyAgent | undefined {
  const url = resolveProxyUrl("PHAETON_PROXY_URL");
  if (!url) return undefined;
  if (!_proxyAgent) _proxyAgent = new ProxyAgent(url);
  return _proxyAgent;
}

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

function maskQuery(url: string): string {
  return url
    .replace(/(UserGuid=)[^&]+/i, "$1***")
    .replace(/(ApiKey=)[^&]+/i, "$1***")
    .replace(/(ContragentGuid=)[^&]+/i, "$1***");
}

/**
 * Phaeton's API decodes URL parameters as Windows-1251, not UTF-8. So a
 * Cyrillic Article like "колодки" sent as %D0%BA%D0%BE… (UTF-8) lands as
 * mojibake on their side and matches nothing. Encode Cyrillic chars to
 * the win-1251 byte range, percent-escape them, and pass through ASCII
 * untouched.
 */
function isCyrillic(s: string): boolean {
  return /[\u0400-\u04FF]/.test(s);
}

function win1251PercentEncode(str: string): string {
  let out = "";
  for (const ch of str) {
    const code = ch.charCodeAt(0);
    if (code < 0x80) {
      // ASCII — escape only the chars URLSearchParams would: &, =, +, #, etc.
      if (/[A-Za-z0-9._~!*'()-]/.test(ch)) out += ch;
      else out += "%" + code.toString(16).toUpperCase().padStart(2, "0");
    } else {
      let byte: number | null = null;
      if (code >= 0x0410 && code <= 0x044f) byte = 0xc0 + (code - 0x0410); // А..я
      else if (code === 0x0401) byte = 0xa8; // Ё
      else if (code === 0x0451) byte = 0xb8; // ё
      else if (code === 0x2116) byte = 0xb9; // №
      else if (code === 0x00ab) byte = 0xab;
      else if (code === 0x00bb) byte = 0xbb;
      else if (code === 0x2014 || code === 0x2013) byte = 0x96; // — / –
      else byte = 0x3f; // '?'
      out += "%" + byte.toString(16).toUpperCase().padStart(2, "0");
    }
  }
  return out;
}

function buildQueryString(
  pairs: Iterable<[string, string]>
): string {
  const out: string[] = [];
  for (const [k, v] of pairs) {
    const enc = isCyrillic(v) ? win1251PercentEncode(v) : encodeURIComponent(v);
    out.push(`${encodeURIComponent(k)}=${enc}`);
  }
  return out.join("&");
}

async function phaetonFetch<T>(
  path: string,
  params: Record<string, string | string[] | undefined>
): Promise<T> {
  const base = process.env.PHAETON_BASE_URL || "https://api.phaeton.kz";

  const common: Record<string, string> = {
    UserGuid: env("PHAETON_USER_GUID"),
    ApiKey: env("PHAETON_API_KEY"),
  };
  const contragent = process.env.PHAETON_CONTRAGENT_GUID;
  if (contragent) common.ContragentGuid = contragent;

  const pairs: Array<[string, string]> = [];
  for (const [k, v] of Object.entries({ ...common, ...params })) {
    if (v == null) continue;
    if (Array.isArray(v)) {
      v.forEach((val, i) => pairs.push([`${k}[${i}]`, val]));
    } else {
      pairs.push([k, v]);
    }
  }

  const url = `${base}${path}?${buildQueryString(pairs)}`;
  const safeUrl = maskQuery(url);

  let lastErr: Error | null = null;
  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
    const ctrl = new AbortController();
    const tm = setTimeout(() => ctrl.abort(), DEFAULT_TIMEOUT);
    try {
      const dispatcher = proxyAgent();
      const res = dispatcher
        ? await undiciFetch(url, {
            headers: { accept: "application/json" },
            signal: ctrl.signal,
            dispatcher,
          })
        : await fetch(url, {
            headers: { accept: "application/json" },
            signal: ctrl.signal,
            cache: "no-store",
          });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(
          `Phaeton ${path} → ${res.status} ${res.statusText}. Body: ${text.slice(
            0,
            300
          )}. URL: ${safeUrl}`
        );
      }
      return (await res.json()) as T;
    } catch (err) {
      lastErr = err as Error;
      if (attempt < RETRY_ATTEMPTS && isTransient(lastErr) && !isAbort(lastErr)) {
        console.warn(
          `[phaeton] ${path} attempt ${attempt} transient: ${lastErr.message.slice(0, 120)} — retrying`
        );
        await sleep(RETRY_DELAY_MS);
        continue;
      }
      break;
    } finally {
      clearTimeout(tm);
    }
  }
  // Re-throw but never leak key/guid
  const msg = (lastErr ?? new Error("unknown_error")).message.replace(
    process.env.PHAETON_API_KEY ?? "__NOKEY__",
    "***"
  );
  throw new Error(msg);
}

/** Step A — list of brands matching a part number. */
export function searchBrands(article: string) {
  return phaetonFetch<PhaetonBrandsResponse>("/api/Search", { Article: article });
}

/** Step B — prices & stock for (article, brand) with analogs + Astana filter. */
export function searchPrices(args: {
  article: string;
  brand: string;
  warehouseIds?: string[];
  includeAnalogs?: boolean;
}) {
  return phaetonFetch<PhaetonPricesResponse>("/api/Search", {
    Article: args.article,
    Brand: args.brand,
    Sources: args.warehouseIds,
    includeAnalogs: args.includeAnalogs ? "true" : "false",
  });
}

/** Dictionary (warehouses, statuses, shipping options, addresses). */
export function getDictionary() {
  return phaetonFetch<PhaetonDictionaryResponse>("/api/Dictionary", {});
}
