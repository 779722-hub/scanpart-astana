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
import { CookieJar } from "./cookie-jar";

const WEB = (process.env.SHATEM_WEB_BASE || "https://shate-m.kz").replace(/\/+$/, "");

let jar: CookieJar | null = null;

function hasCreds(): boolean {
  return Boolean(process.env.SHATEM_WEB_LOGIN && process.env.SHATEM_WEB_PASSWORD);
}

/** POST /api/auth/Login → HttpOnly session cookies into the jar. */
async function loginWeb(j: CookieJar): Promise<boolean> {
  const login = process.env.SHATEM_WEB_LOGIN;
  const password = process.env.SHATEM_WEB_PASSWORD;
  if (!login || !password) return false;
  const res = await fetch(`${WEB}/api/auth/Login`, {
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
  const res = await fetch(`${WEB}/api/auth/refresh`, {
    method: "POST",
    headers: { accept: "application/json", cookie: j.header(), "content-type": "application/json" },
    body: "{}",
  });
  if (!res.ok) return false;
  j.absorb(res);
  return true;
}

async function ensureSession(): Promise<CookieJar> {
  if (jar && jar.size > 0) return jar;
  const j = jar ?? new CookieJar();
  jar = j;
  if (j.size === 0 && hasCreds()) await loginWeb(j);
  if (j.size === 0 && process.env.SHATEM_SESSION_COOKIE) {
    j.seedFromHeader(process.env.SHATEM_SESSION_COOKIE);
  }
  if (j.size === 0) {
    throw new Error(
      "Shate-M web session not bootstrapped — set SHATEM_WEB_LOGIN/PASSWORD or SHATEM_SESSION_COOKIE."
    );
  }
  return j;
}

/** Authenticated GET against the web host, with refresh/re-login retry on 401. */
export async function catalogGet<T>(path: string): Promise<T> {
  const j = await ensureSession();
  const doCall = () =>
    fetch(`${WEB}${path}`, {
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
