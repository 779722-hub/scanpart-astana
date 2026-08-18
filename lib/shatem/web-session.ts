/**
 * Shate-M WEB session (cookie-based) for the Laximo catalog under /vin/…
 *
 * The catalog is authorized by HttpOnly session cookies (NOT the apikey Bearer
 * used by lib/shatem/client.ts). We keep those cookies in a module-level jar,
 * renew them via POST /api/auth/refresh on a 401, and re-login when refresh
 * fails — the browser's 401 → refresh → retry cycle, plus autonomous login.
 *
 * Bootstrapping (in priority order):
 *  1. SHATEM_WEB_LOGIN + SHATEM_WEB_PASSWORD → autonomous login (prod, path B).
 *  2. SHATEM_SESSION_COOKIE (raw browser Cookie header) → seed for local dev.
 */
import { fetch as undiciFetch, ProxyAgent } from "undici";
import { resolveProxyUrl } from "@/lib/proxy";
import { CookieJar } from "./cookie-jar";

const WEB = (process.env.SHATEM_WEB_BASE || "https://shate-m.kz").replace(/\/+$/, "");
const TIMEOUT_MS = 15_000;

// On Vercel shate-m.kz is not reachable from the serverless egress region
// (direct calls time out ~11s). Route the Laximo WEB session through the same
// fixed-IP KZ proxy as the trading API (lib/shatem/client.ts) / Autotrade /
// Phaeton. Dev keeps the direct path when no proxy env is set.
let _proxyAgent: ProxyAgent | null = null;
function proxyAgent(): ProxyAgent | undefined {
  const url = resolveProxyUrl("SHATEM_PROXY_URL", "PHAETON_PROXY_URL");
  if (!url) return undefined;
  if (!_proxyAgent) _proxyAgent = new ProxyAgent(url);
  return _proxyAgent;
}

/** fetch against the web host through the proxy (when set), with a timeout. */
function webFetch(
  url: string,
  init: { method?: string; body?: string; headers?: Record<string, string> } = {}
): Promise<Response> {
  const ctrl = new AbortController();
  const tm = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const dispatcher = proxyAgent();
  const p = dispatcher
    ? undiciFetch(url, {
        method: init.method,
        body: init.body,
        headers: init.headers,
        signal: ctrl.signal,
        dispatcher,
      })
    : fetch(url, { ...init, signal: ctrl.signal, cache: "no-store" });
  return (p as Promise<Response>).finally(() => clearTimeout(tm));
}

let jar: CookieJar | null = null;

function hasCreds(): boolean {
  return Boolean(process.env.SHATEM_WEB_LOGIN && process.env.SHATEM_WEB_PASSWORD);
}

/** POST /api/auth/Login → HttpOnly session cookies into the jar. */
async function loginWeb(j: CookieJar): Promise<boolean> {
  const login = process.env.SHATEM_WEB_LOGIN;
  const password = process.env.SHATEM_WEB_PASSWORD;
  if (!login || !password) return false;
  const res = await webFetch(`${WEB}/api/auth/Login`, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
    body:
      `login=${encodeURIComponent(login)}&password=${encodeURIComponent(password)}` +
      `&rememberMe=true`,
  });
  if (!res.ok) return false;
  j.absorb(res);
  return j.size > 0;
}

async function refresh(j: CookieJar): Promise<boolean> {
  const res = await webFetch(`${WEB}/api/auth/refresh`, {
    method: "POST",
    headers: { accept: "application/json", cookie: j.header(), "content-type": "application/json" },
    body: "{}",
  });
  if (!res.ok) return false;
  j.absorb(res);
  return true;
}

// Single-flight: concurrent cold-start requests share one bootstrap so they
// don't each POST /auth/Login and clobber each other's cookies.
let _bootstrap: Promise<CookieJar> | null = null;

async function ensureSession(): Promise<CookieJar> {
  if (jar && jar.size > 0) return jar;
  if (!_bootstrap) {
    _bootstrap = (async () => {
      const j = new CookieJar();
      if (hasCreds()) await loginWeb(j);
      if (j.size === 0 && process.env.SHATEM_SESSION_COOKIE) {
        j.seedFromHeader(process.env.SHATEM_SESSION_COOKIE);
      }
      if (j.size === 0) {
        throw new Error(
          "Shate-M web session not bootstrapped — set SHATEM_WEB_LOGIN/PASSWORD or SHATEM_SESSION_COOKIE."
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

/** Authenticated GET against the web host, with refresh/re-login retry on 401. */
export async function catalogGet<T>(path: string): Promise<T> {
  const j = await ensureSession();
  const doCall = () =>
    webFetch(`${WEB}${path}`, {
      headers: { accept: "application/json", cookie: j.header(), "x-requested-with": "XMLHttpRequest" },
    });

  let res = await doCall();
  if (res.status === 401) {
    // Try a cheap refresh first, then a full re-login (creds only).
    const ok = (await refresh(j)) || (await loginWeb(j));
    if (ok) res = await doCall();
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Shate-M catalog ${path} → ${res.status}. Body: ${text.slice(0, 160)}`);
  }
  return (await res.json()) as T;
}
