import { ProxyAgent, type Dispatcher } from "undici";
import type {
  PhaetonBrandsResponse,
  PhaetonDictionaryResponse,
  PhaetonPricesResponse,
} from "./types";

const DEFAULT_TIMEOUT = 15_000;

/**
 * Phaeton requires a static IP whitelist. On Vercel egress IPs are random,
 * so we route Phaeton calls through a fixed-IP proxy (e.g. Fixie). Configure
 * via env: PHAETON_PROXY_URL=http://user:pass@proxy.host:port
 */
let _proxyAgent: ProxyAgent | null = null;
function proxyAgent(): Dispatcher | undefined {
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

  const ctrl = new AbortController();
  const tm = setTimeout(() => ctrl.abort(), DEFAULT_TIMEOUT);
  try {
    const res = await fetch(url, {
      headers: { accept: "application/json" },
      signal: ctrl.signal,
      // Cache handled per-call by the caller via `next: { revalidate }` if desired.
      cache: "no-store",
      // @ts-expect-error — undici dispatcher for proxy routing; valid in Node fetch.
      dispatcher: proxyAgent(),
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
    // Re-throw but never leak key/guid
    const msg = (err as Error).message.replace(
      process.env.PHAETON_API_KEY ?? "__NOKEY__",
      "***"
    );
    throw new Error(msg);
  } finally {
    clearTimeout(tm);
  }
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
