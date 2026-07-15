import { fetch as undiciFetch, ProxyAgent } from "undici";
import { CookieJar } from "@/lib/shatem/cookie-jar";

/**
 * Autotrade (sklad.autotrade.kz) authenticated web session.
 *
 * The wholesale search is behind a login. The login is a plain AJAX POST
 * (no client-side password hashing — verified from login.js):
 *   POST /login/?time=<ms>&m=entrance   body: login=<email>&pass=<pwd>&remember=0
 * A browser-like User-Agent is required (the site redirects old UAs to
 * /outdated_browser.php) and the host sits behind DDoS-Guard, so on production
 * we route through the same residential proxy as Phaeton/Autodoc.
 *
 * Bootstrapping (priority): AUTOTRADE_LOGIN + AUTOTRADE_PASSWORD → autonomous
 * login; otherwise AUTOTRADE_SESSION_COOKIE (raw browser Cookie header) for dev.
 */

const BASE = (process.env.AUTOTRADE_BASE || "https://sklad.autotrade.kz").replace(/\/+$/, "");

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36";

const TIMEOUT_MS = 12_000;

let _proxyAgent: ProxyAgent | null = null;
function proxyAgent(): ProxyAgent | undefined {
  const url = process.env.AUTOTRADE_PROXY_URL || process.env.PHAETON_PROXY_URL;
  if (!url) return undefined;
  if (!_proxyAgent) _proxyAgent = new ProxyAgent(url);
  return _proxyAgent;
}

export interface AtResponse {
  status: number;
  url: string;
  html: string;
}

/** One low-level request with UA + cookies, through the proxy when configured. */
async function raw(
  url: string,
  jar: CookieJar,
  init: { method?: string; body?: string; headers?: Record<string, string> } = {}
): Promise<AtResponse> {
  const ctrl = new AbortController();
  const tm = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const headers: Record<string, string> = {
      "user-agent": UA,
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "ru-RU,ru;q=0.9,en;q=0.8",
      "upgrade-insecure-requests": "1",
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
    const html = await res.text();
    return { status: res.status, url: (res as { url?: string }).url ?? url, html };
  } finally {
    clearTimeout(tm);
  }
}

function hasCreds(): boolean {
  return Boolean(process.env.AUTOTRADE_LOGIN && process.env.AUTOTRADE_PASSWORD);
}

/** Autonomous login: warm up for cookies (ddg/sessid), then POST credentials. */
async function login(jar: CookieJar): Promise<boolean> {
  const email = process.env.AUTOTRADE_LOGIN;
  const password = process.env.AUTOTRADE_PASSWORD;
  if (!email || !password) return false;

  // Warm-up GET to collect DDoS-Guard + session cookies and pass the UA gate.
  await raw(`${BASE}/login/`, jar, {});

  const body =
    `login=${encodeURIComponent(email)}` +
    `&pass=${encodeURIComponent(password)}` +
    `&remember=0`;
  const res = await raw(`${BASE}/login/?time=${Date.now()}&m=entrance`, jar, {
    method: "POST",
    body,
    headers: {
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
      "x-requested-with": "XMLHttpRequest",
      accept: "*/*",
      referer: `${BASE}/login/`,
      origin: BASE,
    },
  });
  // The endpoint returns a small number; >=5 means the "I am human" captcha
  // kicked in (too many attempts). Anything else with cookies set → assume ok;
  // isLoggedIn() confirms by probing an authed page.
  const failedAttempts = parseInt(res.html.trim(), 10);
  if (Number.isFinite(failedAttempts) && failedAttempts >= 5) return false;
  return jar.size > 0;
}

/** A request that redirects to the home/login page means we're logged out. */
function looksLoggedOut(res: AtResponse): boolean {
  return /\/login\/?$/.test(res.url) || new URL(res.url).pathname === "/";
}

let jar: CookieJar | null = null;
let _bootstrap: Promise<CookieJar> | null = null;

async function ensureSession(): Promise<CookieJar> {
  if (jar && jar.size > 0) return jar;
  if (!_bootstrap) {
    _bootstrap = (async () => {
      const j = new CookieJar();
      if (hasCreds()) await login(j);
      if (j.size === 0 && process.env.AUTOTRADE_SESSION_COOKIE) {
        j.seedFromHeader(process.env.AUTOTRADE_SESSION_COOKIE);
      }
      if (j.size === 0) {
        throw new Error(
          "Autotrade session not bootstrapped — set AUTOTRADE_LOGIN/PASSWORD or AUTOTRADE_SESSION_COOKIE."
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

/** True when Autotrade is configured (creds or a seeded cookie). */
export function autotradeConfigured(): boolean {
  return hasCreds() || Boolean(process.env.AUTOTRADE_SESSION_COOKIE);
}

/**
 * Authenticated GET of an absolute Autotrade URL (or a path). Re-logs in once if
 * the session has expired (redirect to /login or /).
 */
export async function authedGet(pathOrUrl: string): Promise<AtResponse> {
  const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${BASE}${pathOrUrl}`;
  const j = await ensureSession();
  let res = await raw(url, j, {});
  if (looksLoggedOut(res) && hasCreds()) {
    jar = null;
    j.clear();
    if (await login(j)) {
      jar = j;
      res = await raw(url, j, {});
    }
  }
  return res;
}

/** Authenticated POST (form-urlencoded body). Re-logs in once on session loss. */
export async function authedPost(
  pathOrUrl: string,
  body: string,
  headers: Record<string, string> = {}
): Promise<AtResponse> {
  const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${BASE}${pathOrUrl}`;
  const j = await ensureSession();
  const h = {
    "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
    "x-requested-with": "XMLHttpRequest",
    accept: "application/json, text/javascript, */*; q=0.01",
    referer: `${BASE}/search/`,
    origin: BASE,
    ...headers,
  };
  let res = await raw(url, j, { method: "POST", body, headers: h });
  if (looksLoggedOut(res) && hasCreds()) {
    jar = null;
    j.clear();
    if (await login(j)) {
      jar = j;
      res = await raw(url, j, { method: "POST", body, headers: h });
    }
  }
  return res;
}

/** Build a by-article search URL with crosses/replacements enabled. */
export function articleSearchUrl(query: string, limit = 20): string {
  const p = new URLSearchParams({
    type: "article",
    q: query,
    mode: "by_full_article",
    page: "1",
    limit: String(limit),
    cross: "1",
    replace: "1",
    bycross: "0",
    related: "0",
  });
  return `${BASE}/search/?${p.toString()}`;
}

/** The 3 Astana warehouse IDs (we only ever sell from Astana). */
export const ASTANA_STORAGE_IDS = [168102, 247102, 262102];

/**
 * Call the Autotrade JSON-RPC proxy (/api_proxy.php). Auth is by session cookie;
 * `auth_key` is a server-side placeholder. Returns the parsed JSON object.
 */
export async function autotradeApi(
  method: string,
  params: unknown
): Promise<Record<string, unknown>> {
  const body =
    "data=" +
    encodeURIComponent(JSON.stringify({ auth_key: ":auth_key", method, params }));
  const res = await authedPost("/api_proxy.php", body);
  return JSON.parse(res.html) as Record<string, unknown>;
}
