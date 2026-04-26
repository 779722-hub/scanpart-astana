import { fetch as undiciFetch, ProxyAgent } from "undici";
import type {
  PhaetonBrandsResponse,
  PhaetonDictionaryResponse,
  PhaetonPricesResponse,
} from "./types";

const DEFAULT_TIMEOUT = 20_000;
const RETRY_ATTEMPTS = 2; // initial + 1 retry on transient failure
const RETRY_DELAY_MS = 600;

function isTransient(err: Error): boolean {
  const m = err.message;
  return (
    /aborted|timed?\s*out|ECONN|ENOTFOUND|EAI_AGAIN|fetch failed|socket hang up/i.test(m) ||
    /\b5\d\d\b/.test(m) // any 5xx upstream
  );
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
  const url = process.env.PHAETON_PROXY_URL;
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

  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...common, ...params })) {
    if (v == null) continue;
    if (Array.isArray(v)) {
      v.forEach((val, i) => qs.append(`${k}[${i}]`, val));
    } else {
      qs.append(k, v);
    }
  }

  const url = `${base}${path}?${qs.toString()}`;
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
      if (attempt < RETRY_ATTEMPTS && isTransient(lastErr)) {
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
