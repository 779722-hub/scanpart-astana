import { fetch as undiciFetch, ProxyAgent } from "undici";
import { CookieJar } from "@/lib/shatem/cookie-jar";
import { resolveProxyUrl } from "@/lib/proxy";

/**
 * Interkom (opt.interkom.kz) authenticated web session.
 *
 * The B2B wholesale catalog is behind a login. Auth is a plain AJAX POST
 * (no client-side hashing):
 *   POST /opt/login   body: login=<login>&password=<pwd>
 * On success the server returns {"result":true,...} and sets the `b2b` session
 * cookie (Path=/opt, Max-Age=900 = 15 min). We auto re-login on HTTP 401.
 *
 * On production suppliers route through the same KZ fixed-IP proxy as
 * Phaeton/Autotrade (INTERKOM_PROXY_URL, falls back to PHAETON_PROXY_URL); when
 * no proxy env is set we call the site directly (local dev).
 */

const BASE = (process.env.INTERKOM_BASE || "https://opt.interkom.kz").replace(/\/+$/, "");

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36";

const TIMEOUT_MS = 12_000;

let _proxyAgent: ProxyAgent | null = null;
function proxyAgent(): ProxyAgent | undefined {
  const url = resolveProxyUrl("INTERKOM_PROXY_URL", "PHAETON_PROXY_URL");
  if (!url) return undefined;
  if (!_proxyAgent) _proxyAgent = new ProxyAgent(url);
  return _proxyAgent;
}

export interface IkResponse {
  status: number;
  url: string;
  body: string;
}

/** One low-level request with UA + cookies, through the proxy when configured. */
async function raw(
  url: string,
  jar: CookieJar,
  init: { method?: string; body?: string; headers?: Record<string, string> } = {}
): Promise<IkResponse> {
  const ctrl = new AbortController();
  const tm = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const headers: Record<string, string> = {
      "user-agent": UA,
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "ru-RU,ru;q=0.9,en;q=0.8",
      ...(jar.header() ? { cookie: jar.header() } : {}),
      ...init.headers,
    };
    const dispatcher = proxyAgent();
    const res = dispatcher
      ? await undiciFetch(url, {
          method: init.method ?? "GET",
          headers,
          body: init.body,
          dispatcher,
          signal: ctrl.signal,
          redirect: "follow",
        })
      : await fetch(url, {
          method: init.method ?? "GET",
          headers,
          body: init.body,
          signal: ctrl.signal,
          cache: "no-store",
          redirect: "follow",
        });
    jar.absorb(res as unknown as Response);
    const body = await res.text();
    return { status: res.status, url: (res as { url?: string }).url ?? url, body };
  } finally {
    clearTimeout(tm);
  }
}

/** True when Interkom credentials are configured. */
export function interkomConfigured(): boolean {
  return Boolean(process.env.INTERKOM_LOGIN && process.env.INTERKOM_PASSWORD);
}

/** Autonomous login: POST credentials, expect {"result":true} + `b2b` cookie. */
async function login(jar: CookieJar): Promise<boolean> {
  const email = process.env.INTERKOM_LOGIN;
  const password = process.env.INTERKOM_PASSWORD;
  if (!email || !password) return false;

  // Warm-up GET to pass the UA gate and collect any initial cookies.
  await raw(`${BASE}/opt/`, jar, {});

  const body =
    `login=${encodeURIComponent(email)}` +
    `&password=${encodeURIComponent(password)}`;
  const res = await raw(`${BASE}/opt/login`, jar, {
    method: "POST",
    body,
    headers: {
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
      "x-requested-with": "XMLHttpRequest",
      accept: "application/json, text/javascript, */*; q=0.01",
      referer: `${BASE}/opt/`,
      origin: BASE,
    },
  });
  try {
    const j = JSON.parse(res.body) as { result?: boolean };
    if (j.result === true) return jar.size > 0;
  } catch {
    /* non-JSON → treat as failure */
  }
  return false;
}

let jar: CookieJar | null = null;
let _bootstrap: Promise<CookieJar> | null = null;

async function ensureSession(): Promise<CookieJar> {
  if (jar && jar.size > 0) return jar;
  if (!_bootstrap) {
    _bootstrap = (async () => {
      const j = new CookieJar();
      await login(j);
      if (j.size === 0) {
        throw new Error(
          "Interkom session not bootstrapped — set INTERKOM_LOGIN/INTERKOM_PASSWORD."
        );
      }
      jar = j;
      return j;
    })().finally(() => {
      _bootstrap = null;
    });
  }
  return _bootstrap;
}

/** Authenticated POST (form-urlencoded body). Re-logs in once on HTTP 401. */
export async function authedPost(
  pathOrUrl: string,
  body: string,
  headers: Record<string, string> = {}
): Promise<IkResponse> {
  const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${BASE}${pathOrUrl}`;
  const j = await ensureSession();
  const h = {
    "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
    "x-requested-with": "XMLHttpRequest",
    accept: "application/json, text/javascript, */*; q=0.01",
    referer: `${BASE}/opt/`,
    origin: BASE,
    ...headers,
  };
  let res = await raw(url, j, { method: "POST", body, headers: h });
  if (res.status === 401) {
    jar = null;
    j.clear();
    if (await login(j)) {
      jar = j;
      res = await raw(url, j, { method: "POST", body, headers: h });
    }
  }
  return res;
}

/** Authenticated GET (absolute URL or /opt path). Re-logs in once on HTTP 401. */
export async function authedGet(pathOrUrl: string): Promise<IkResponse> {
  const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${BASE}${pathOrUrl}`;
  const j = await ensureSession();
  let res = await raw(url, j, {});
  if (res.status === 401) {
    jar = null;
    j.clear();
    if (await login(j)) {
      jar = j;
      res = await raw(url, j, {});
    }
  }
  return res;
}

/**
 * Segment (brand switcher) GUIDs — a segment is MANDATORY on /opt/itemsSearch.
 * Keys are our canonical make labels; values are Interkom's brand GUIDs.
 */
export const INTERKOM_SEGMENTS: Record<string, string> = {
  CHEVROLET: "e87444f2-f60d-11ec-818f-00155df68500",
  "China Cars": "6f118d38-775f-11f0-b38a-00155df6851c",
  Gaz: "bde3ccd6-3630-11ec-8779-00155d3ff709",
  HYUNDAI: "625243e3-3633-11ec-8779-00155d3ff709",
  KAMAZ: "c387f317-3656-11ec-8779-00155d3ff709",
  KIA: "8d389fd0-3656-11ec-8779-00155d3ff709",
  LADA: "d227a6f5-361f-11ec-8779-00155d3ff709",
  RENAULT: "354ef38d-3632-11ec-8779-00155d3ff709",
};
