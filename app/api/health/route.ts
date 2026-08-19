import { NextResponse } from "next/server";
import { getSetting } from "@/lib/sheets/settings";
import { getLocations } from "@/lib/shatem/client";
import { checkProxyHealth } from "@/lib/proxy-health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VERSION = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? process.env.GITHUB_SHA?.slice(0, 7) ?? "dev";

async function checkUrl(url: string, timeoutMs = 4000): Promise<boolean> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
    return res.ok || res.status === 401 || res.status === 403; // any reachable answer counts
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

/** Does the bot token actually work? Presence of a value proves nothing. */
async function checkTelegramToken(token: string, timeoutMs = 4000): Promise<boolean> {
  if (!token) return false;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
      signal: ctrl.signal,
      cache: "no-store",
    });
    const j = (await res.json().catch(() => null)) as { ok?: boolean } | null;
    return Boolean(j?.ok);
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

export async function GET() {
  const phaetonBase = process.env.PHAETON_BASE_URL || "https://api.phaeton.kz";
  const shatemConfigured = Boolean(process.env.SHATEM_API_KEY);
  const autotradeConfigured = Boolean(
    process.env.AUTOTRADE_API_KEY || process.env.AUTOTRADE_LOGIN
  );
  const interkomConfigured = Boolean(
    process.env.INTERKOM_LOGIN && process.env.INTERKOM_PASSWORD
  );

  const sheetsConfigured = Boolean(
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 &&
      process.env.SHEETS_SPREADSHEET_ID
  );

  // Токен бота живёт в админке ИЛИ в env (см. lib/telegram/notify) — раньше
  // здесь смотрели только env, поэтому панель показывала «не подключён» при
  // рабочем боте. Настройки читаем кэшированным getSetting (60 с), а не
  // свежим чтением: /api/health публичный и его опрашивают.
  let sheetsOk = false;
  let tgTokenSetting: string | undefined;
  let tgChat = "";
  let interkomEnabled = false;
  if (sheetsConfigured) {
    try {
      const [tok, chat, ikEnabled] = await Promise.all([
        getSetting("telegram_bot_token"),
        getSetting("telegram_chat_id"),
        getSetting("interkom_enabled"),
      ]);
      tgTokenSetting = tok;
      tgChat = (chat ?? "").trim();
      interkomEnabled = (ikEnabled ?? "").trim() === "on";
      sheetsOk = true;
    } catch {
      sheetsOk = false;
    }
  }
  const tgToken = (tgTokenSetting || process.env.TELEGRAM_BOT_TOKEN || "").trim();

  const [phaetonOk, shatemReachable, tgTokenOk, proxy] = await Promise.all([
    checkUrl(`${phaetonBase}/`),
    // Shate-M lives behind the KZ proxy (its root pinged directly from Vercel
    // always fails — a false alarm). Probe the way search actually uses it:
    // an authed call through the proxy. Fail-safe → never throws the endpoint.
    shatemConfigured
      ? getLocations()
          .then((l) => l.length > 0)
          .catch(() => false)
      : Promise.resolve(false),
    checkTelegramToken(tgToken),
    // Живость KZ-прокси (общий канал всех поставщиков). Кэш ~30с + свой таймаут,
    // fail-safe — латентность /api/health не растёт.
    checkProxyHealth(),
  ]);

  // Заказ уходит в телеграм только если есть И рабочий токен, И чат
  // (см. app/api/order) — поэтому «ok» лишь когда есть оба.
  const telegram = !tgToken
    ? "missing"
    : !tgTokenOk
      ? "fail"
      : !tgChat
        ? "no-chat"
        : "ok";

  // Uptime monitors poll this — reflect core health (Google Sheets: settings,
  // orders, content), not Phaeton's unproxied root ping, which fails from
  // Vercel→KZ as a false alarm even when the site is fully up.
  const ok = sheetsConfigured ? sheetsOk : true;
  return NextResponse.json(
    {
      ok,
      version: VERSION,
      timestamp: new Date().toISOString(),
      checks: {
        phaeton: phaetonOk ? "ok" : "fail",
        shatem: shatemConfigured ? (shatemReachable ? "ok" : "fail") : "missing",
        autotrade: autotradeConfigured ? "configured" : "missing",
        // Interkom: "missing" без кредов; "off" если креды есть, но выключатель
        // interkom_enabled не «on»; "ok" (подключён) когда есть и то, и другое.
        interkom: !interkomConfigured ? "missing" : interkomEnabled ? "ok" : "off",
        proxy: !proxy.configured ? "missing" : proxy.ok ? "ok" : "fail",
        sheets: !sheetsConfigured ? "missing" : sheetsOk ? "ok" : "fail",
        cloudinary:
          process.env.CLOUDINARY_CLOUD_NAME || process.env.CLOUDINARY_URL
            ? "configured"
            : "missing",
        telegram,
      },
    },
    { status: ok ? 200 : 503 }
  );
}
