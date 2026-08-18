/**
 * shop.phaeton.kz WEB session (cookie-based) — каталог с фото за логином.
 *
 * Вход: ASP.NET MVC форма с antiforgery-токеном:
 *   GET  /ru-RU/Account/Login  → antiforgery-cookie + токен в HTML формы
 *   POST /ru-RU/Account/Login  (Login, Password, __RequestVerificationToken)
 * Успех → auth-cookie в jar, 302 на ReturnUrl.
 *
 * Креды: PHAETON_SHOP_LOGIN + PHAETON_SHOP_PASSWORD. Egress через тот же
 * фиксированный прокси, что и API Phaeton (PHAETON_PROXY_URL), если задан —
 * на случай IP-привязки.
 */
import { fetch as undiciFetch, type Response as UndiciResponse } from "undici";
import { CookieJar } from "@/lib/shatem/cookie-jar";
import { getProxyAgent, resetProxyAgent, isProxyConnError } from "@/lib/proxy";

const WEB = (process.env.PHAETON_SHOP_BASE || "https://shop.phaeton.kz").replace(/\/+$/, "");
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36";

function webFetch(
  path: string,
  jar: CookieJar,
  init: { method?: string; body?: string; headers?: Record<string, string>; redirect?: "follow" | "manual" } = {}
): Promise<UndiciResponse> {
  const headers: Record<string, string> = {
    "user-agent": UA,
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "accept-language": "ru-RU,ru;q=0.9",
    ...(jar.header() ? { cookie: jar.header() } : {}),
    ...init.headers,
  };
  return undiciFetch(`${WEB}${path}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body,
    redirect: init.redirect ?? "manual",
    dispatcher: getProxyAgent("PHAETON_PROXY_URL"),
  }).catch((err) => {
    // Мёртвый туннель прокси → сбросить агент, следующий запрос переподключится.
    if (isProxyConnError(err)) resetProxyAgent("PHAETON_PROXY_URL");
    throw err;
  });
}

function hasCreds(): boolean {
  return Boolean(process.env.PHAETON_SHOP_LOGIN && process.env.PHAETON_SHOP_PASSWORD);
}

export function phaetonShopConfigured(): boolean {
  return hasCreds();
}

async function login(jar: CookieJar): Promise<boolean> {
  if (!hasCreds()) return false;
  // 1) GET формы — antiforgery cookie + токен.
  const g = await webFetch("/ru-RU/Account/Login", jar, { redirect: "follow" });
  jar.absorb(g as unknown as Response);
  const html = await g.text();
  const token =
    /name="__RequestVerificationToken"[^>]*\bvalue="([^"]+)"/i.exec(html)?.[1] ??
    /\bvalue="([^"]+)"[^>]*name="__RequestVerificationToken"/i.exec(html)?.[1];
  if (!token) return false;

  // 2) POST кредов.
  const body = new URLSearchParams({
    __RequestVerificationToken: token,
    ReturnUrl: "",
    Login: process.env.PHAETON_SHOP_LOGIN!,
    Password: process.env.PHAETON_SHOP_PASSWORD!,
    RememberMe: "false",
  }).toString();
  const p = await webFetch("/ru-RU/Account/Login", jar, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    redirect: "manual",
  });
  jar.absorb(p as unknown as Response);
  // Успех: редирект (302) после POST + признак auth-cookie.
  const cookies = jar.header();
  return (p.status === 302 || p.status === 200) && /aspnet|identity|auth|\.AspNet/i.test(cookies);
}

let jar: CookieJar | null = null;
let _bootstrap: Promise<CookieJar> | null = null;

async function ensureSession(): Promise<CookieJar> {
  if (jar && jar.size > 0) return jar;
  if (!_bootstrap) {
    _bootstrap = (async () => {
      const j = new CookieJar();
      await login(j);
      if (j.size === 0) throw new Error("Phaeton shop session not bootstrapped — set PHAETON_SHOP_LOGIN/PASSWORD.");
      jar = j;
      return j;
    })().finally(() => {
      _bootstrap = null;
    });
  }
  return _bootstrap;
}

function looksLoggedOut(res: UndiciResponse): boolean {
  const loc = res.headers.get("location") || "";
  return res.status === 302 && /Account\/Login/i.test(loc);
}

/** Authenticated GET страницы каталога, с одним повтором после релогина. */
export async function shopGetHtml(path: string): Promise<{ status: number; html: string }> {
  const j = await ensureSession();
  let res = await webFetch(path, j, { redirect: "manual" });
  if (looksLoggedOut(res)) {
    jar = null;
    j.clear();
    if (await login(j)) {
      jar = j;
      res = await webFetch(path, j, { redirect: "manual" });
    }
  }
  return { status: res.status, html: await res.text() };
}
