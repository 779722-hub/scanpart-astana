/**
 * Shate-M WebApi client.  Docs: https://api-doc.shate-m.kz/
 *
 * Auth: POST /auth/loginByapiKey → Bearer access_token (~1800s). We cache the
 * token in-module (single-flight) and re-auth on expiry or on a 401. Base URL
 * + key come from env: SHATEM_BASE_URL, SHATEM_API_KEY.
 */
import type {
  ShatemAuthResponse,
  ShatemArticleHit,
  ShatemArticlePrices,
  ShatemAgreement,
  ShatemDeliveryAddress,
  ShatemLocation,
  ShatemPriceFilterKey,
  ShatemArticleWithContents,
  ShatemContentResult,
} from "./types";

const DEFAULT_TIMEOUT = 20_000;
const TOKEN_SKEW_MS = 60_000; // refresh a minute before real expiry

function base(): string {
  return (process.env.SHATEM_BASE_URL || "https://api.shate-m.kz").replace(/\/+$/, "");
}

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

// ---- token cache (per serverless instance) ---------------------------------
let _token: { value: string; expiresAt: number } | null = null;

async function login(): Promise<string> {
  const res = await rawFetch("/api/v1/auth/loginByapiKey", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: `apikey=${encodeURIComponent(env("SHATEM_API_KEY"))}`,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Shate-M auth → ${res.status} ${res.statusText}. Body: ${text.slice(0, 200)}`);
  }
  const json = (await res.json()) as ShatemAuthResponse;
  if (!json.access_token) throw new Error("Shate-M auth: no access_token in response");
  const ttl = (json.expires_in ? json.expires_in * 1000 : 1800_000) - TOKEN_SKEW_MS;
  _token = { value: json.access_token, expiresAt: Date.now() + Math.max(ttl, 30_000) };
  return json.access_token;
}

// Single-flight: concurrent callers on a cold instance share one login().
let _loginInFlight: Promise<string> | null = null;

async function token(): Promise<string> {
  if (_token && Date.now() < _token.expiresAt) return _token.value;
  if (!_loginInFlight) {
    _loginInFlight = login().finally(() => {
      _loginInFlight = null;
    });
  }
  return _loginInFlight;
}

function rawFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const ctrl = new AbortController();
  const tm = setTimeout(() => ctrl.abort(), DEFAULT_TIMEOUT);
  const headers: Record<string, string> = {
    accept: "application/json",
    ...(init.body ? { "content-type": "application/json" } : {}),
    ...((init.headers as Record<string, string>) || {}),
  };
  return fetch(`${base()}${path}`, {
    ...init,
    headers,
    signal: ctrl.signal,
    cache: "no-store",
  }).finally(() => clearTimeout(tm));
}

/** Authenticated JSON call with one automatic re-auth on 401. */
async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const doCall = async () => {
    const t = await token();
    const res = await rawFetch(path, {
      ...init,
      headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${t}` },
    });
    return { res, usedToken: t };
  };
  let { res, usedToken } = await doCall();
  if (res.status === 401) {
    // Only invalidate if nobody else already refreshed to a newer token.
    if (_token?.value === usedToken) _token = null;
    ({ res } = await doCall());
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Shate-M ${path} → ${res.status} ${res.statusText}. Body: ${text.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

// ---- endpoints -------------------------------------------------------------

/** Warehouse directory — used by astana.ts to resolve Astana location codes. */
export function getLocations(): Promise<ShatemLocation[]> {
  return api<ShatemLocation[]>("/api/v1/locations");
}

export function getAgreements(): Promise<ShatemAgreement[]> {
  return api<ShatemAgreement[]>("/api/v1/customer/agreements");
}

export function getDeliveryAddresses(): Promise<ShatemDeliveryAddress[]> {
  return api<ShatemDeliveryAddress[]>("/api/v1/delivery/addresses");
}

/** Step A — resolve an article code to Shate-M internal articleId(s) + brand. */
export function searchArticles(code: string): Promise<ShatemArticleHit[]> {
  return api<ShatemArticleHit[]>(`/api/v1/articles/search/${encodeURIComponent(code)}`);
}

/** Article with its media list — used to resolve a part photo/schematic. */
export function getArticleWithContents(
  articleId: number
): Promise<ShatemArticleWithContents> {
  return api<ShatemArticleWithContents>(
    `/api/v1/articles/${articleId}?include=contents`
  );
}

/** Resolve a contentId to its image (returns base64 data URI in `value`). */
export function searchContent(
  contentId: string,
  size = 400
): Promise<ShatemContentResult[]> {
  return api<ShatemContentResult[]>("/api/v1/contents/search", {
    method: "POST",
    body: JSON.stringify({ contentKeys: [contentId], heightSize: size, widthSize: size }),
  });
}

/** Raw POST /contents/search — returns status+body for shape probing (debug). */
export async function postContentsRaw(
  body: unknown
): Promise<{ status: number; text: string }> {
  const t = await token();
  const res = await rawFetch("/api/v1/contents/search", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { Authorization: `Bearer ${t}` },
  });
  return { status: res.status, text: (await res.text()).slice(0, 400) };
}

/**
 * Step B — price + stock for internal articleId(s), grouped with article info
 * (brand/code/name). Request body is an ARRAY of ArticlePriceFilterKey.
 */
export function searchPricesWithArticleInfo(
  keys: ShatemPriceFilterKey[]
): Promise<ShatemArticlePrices[]> {
  return api<ShatemArticlePrices[]>("/api/v1/prices/search/with_article_info", {
    method: "POST",
    body: JSON.stringify(keys),
  });
}

// ---- account context (agreement + delivery address), cached ----------------
let _ctx: { agreementCode?: string; deliveryAddressCode?: string; at: number } | null = null;
const CTX_TTL = 1000 * 60 * 60; // 1h

/** First active agreement + first delivery address — required by prices/search. */
export async function getContext(): Promise<{
  agreementCode?: string;
  deliveryAddressCode?: string;
}> {
  if (_ctx && Date.now() - _ctx.at < CTX_TTL) return _ctx;
  const [agreements, addresses] = await Promise.all([
    getAgreements().catch(() => [] as ShatemAgreement[]),
    getDeliveryAddresses().catch(() => [] as ShatemDeliveryAddress[]),
  ]);
  const agreementCode =
    agreements.find((a) => a.isActive)?.code ?? agreements[0]?.code;
  const deliveryAddressCode = addresses[0]?.code;
  _ctx = { agreementCode, deliveryAddressCode, at: Date.now() };
  return _ctx;
}
