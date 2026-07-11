/**
 * Диагностика веб-логина Shate-M: POST /api/auth/Login.
 * Печатает статус, тело и наличие Set-Cookie. Значения кред не печатает.
 *   npx tsx scripts/shatem-login-probe.ts
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env" });

const WEB = (process.env.SHATEM_WEB_BASE || "https://shate-m.kz").replace(/\/+$/, "");
const login = process.env.SHATEM_WEB_LOGIN || "";
const password = process.env.SHATEM_WEB_PASSWORD || "";

async function attempt(label: string, init: RequestInit) {
  const res = await fetch(`${WEB}/api/auth/Login`, init);
  const text = await res.text();
  const setCookie = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  console.log(`\n[${label}] → ${res.status} ${res.statusText}`);
  console.log(`  set-cookie: ${setCookie.length} шт. ${setCookie.map((c) => c.split("=")[0]).join(", ")}`);
  console.log(`  body: ${text.slice(0, 300).replace(/\s+/g, " ")}`);
}

async function main() {
  if (!login || !password) {
    console.error("Нет SHATEM_WEB_LOGIN/PASSWORD в .env");
    process.exit(1);
  }
  // 1) JSON
  await attempt("JSON", {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({ login, password, rememberMe: true }),
  });
  // 2) form-urlencoded
  await attempt("form", {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
    body: `login=${encodeURIComponent(login)}&password=${encodeURIComponent(password)}&rememberMe=true`,
  });
}

main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
