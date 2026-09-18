import { NextResponse } from "next/server";
import { getSetting } from "@/lib/sheets/settings";
import { checkProxyHealth } from "@/lib/proxy-health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VERSION = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? process.env.GITHUB_SHA?.slice(0, 7) ?? "dev";

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
  const phaetonConfigured = Boolean(process.env.PHAETON_API_KEY);
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
  // Честные статусы поставщиков пишет крон /api/cron/proxy-check раз в ~5 мин
  // реальными пробами выдачи (см. lib/monitoring). Health лишь ЧИТАЕТ последний
  // вердикт из настроек — быстро и без тяжёлых запросов на каждый опрос дашборда.
  let phaetonStatus: string | undefined;
  let shatemStatus: string | undefined;
  let autotradeStatus: string | undefined;
  let interkomStatus: string | undefined;
  if (sheetsConfigured) {
    try {
      const [tok, chat, ikEnabled, phStatus, shStatus, atStatus, ikStatus] =
        await Promise.all([
          getSetting("telegram_bot_token"),
          getSetting("telegram_chat_id"),
          getSetting("interkom_enabled"),
          getSetting("phaeton_status"),
          getSetting("shatem_status"),
          getSetting("autotrade_status"),
          getSetting("interkom_status"),
        ]);
      tgTokenSetting = tok;
      tgChat = (chat ?? "").trim();
      interkomEnabled = (ikEnabled ?? "").trim() === "on";
      phaetonStatus = (phStatus ?? "").trim();
      shatemStatus = (shStatus ?? "").trim();
      autotradeStatus = (atStatus ?? "").trim();
      interkomStatus = (ikStatus ?? "").trim();
      sheetsOk = true;
    } catch {
      sheetsOk = false;
    }
  }
  const tgToken = (tgTokenSetting || process.env.TELEGRAM_BOT_TOKEN || "").trim();

  const [tgTokenOk, proxy] = await Promise.all([
    checkTelegramToken(tgToken),
    // Живость KZ-прокси (общий канал всех поставщиков). Кэш ~30с + свой таймаут,
    // fail-safe — латентность /api/health не растёт.
    checkProxyHealth(),
  ]);

  // Все поставщики ходят через один прокси: если он лёг — показываем их «не
  // работает», не дожидаясь крона (иначе дашборд врал бы «отдаёт» во время
  // простоя прокси). Крон при этом статусы НЕ перезаписывает — без шторма
  // алертов на восстановлении.
  const proxyDown = proxy.configured && !proxy.ok;
  const supplierCheck = (
    configured: boolean,
    status: string | undefined,
    off = false
  ): string => {
    if (!configured) return "missing";
    if (off) return "off";
    if (proxyDown) return "fail";
    return status === "up" ? "ok" : status === "down" ? "fail" : "unknown";
  };

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
        // Честные сигналы: реальные пробы выдачи из крона (proxy-check).
        // "missing" без ключа; "off" (Interkom) — выключен тумблером; "unknown" —
        // крон ещё не проверил; "fail" — не отдаёт (или прокси лежит); "ok".
        phaeton: supplierCheck(phaetonConfigured, phaetonStatus),
        shatem: supplierCheck(shatemConfigured, shatemStatus),
        autotrade: supplierCheck(autotradeConfigured, autotradeStatus),
        interkom: supplierCheck(
          interkomConfigured,
          interkomStatus,
          interkomConfigured && !interkomEnabled
        ),
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
