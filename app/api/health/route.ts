import { NextResponse } from "next/server";
import { getSetting } from "@/lib/sheets/settings";
import { checkProxyHealth } from "@/lib/proxy-health";
import { getTelegramToken, getTelegramChatId } from "@/lib/telegram/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VERSION = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? process.env.GITHUB_SHA?.slice(0, 7) ?? "dev";

/**
 * Проверка токена бота — честно и с ПРИЧИНОЙ (наличие значения ничего не доказывает):
 *  - "ok"          — getMe принял токен;
 *  - "invalid"     — Telegram ответил, но токен не принят (неверный/отозванный/опечатка);
 *  - "unreachable" — Telegram недоступен/таймаут/лимит (сеть или 429/5xx, а не токен).
 *
 * Кэш ~60с: /api/health опрашивают часто (дашборд, аптайм-мониторы), а getMe без
 * кэша на каждый опрос может упереться в 429 — и тогда рабочий токен ложно
 * показывался бы «неверным». 429 и 5xx — это транзиент, а не «invalid».
 */
type TgProbe = "ok" | "invalid" | "unreachable";
interface TgResult { probe: TgProbe; status?: number; desc?: string }
let tgCache: { at: number; token: string; r: TgResult } | null = null;
const TG_TTL_MS = 60_000;
async function checkTelegramToken(token: string, timeoutMs = 4000): Promise<TgResult> {
  if (!token) return { probe: "invalid", desc: "empty" };
  if (tgCache && tgCache.token === token && Date.now() - tgCache.at < TG_TTL_MS) {
    return tgCache.r;
  }
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  let r: TgResult;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
      signal: ctrl.signal,
      cache: "no-store",
    });
    const j = (await res.json().catch(() => null)) as
      | { ok?: boolean; description?: string }
      | null;
    if (j?.ok) r = { probe: "ok", status: res.status };
    else if (res.status === 429 || res.status >= 500)
      r = { probe: "unreachable", status: res.status, desc: j?.description };
    else r = { probe: "invalid", status: res.status, desc: j?.description };
  } catch (e) {
    r = { probe: "unreachable", desc: (e as Error).message.slice(0, 120) };
  } finally {
    clearTimeout(t);
  }
  tgCache = { at: Date.now(), token, r };
  return r;
}

export async function GET(req: Request) {
  const diagOn =
    !!process.env.DIAG_TOKEN &&
    new URL(req.url).searchParams.get("diag") === process.env.DIAG_TOKEN;
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

  let sheetsOk = false;
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
      const [ikEnabled, phStatus, shStatus, atStatus, ikStatus] = await Promise.all([
        getSetting("interkom_enabled"),
        getSetting("phaeton_status"),
        getSetting("shatem_status"),
        getSetting("autotrade_status"),
        getSetting("interkom_status"),
      ]);
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
  // Токен и chat_id берём ТЕМ ЖЕ путём, что и реальная отправка (notify.creds,
  // свежее чтение настроек) — иначе health мог тестировать другой (напр. старый
  // env) токен, чем тот, которым бот шлёт сообщения, и врал «неверный токен»
  // при рабочем боте.
  const tgToken = (await getTelegramToken().catch(() => "")).trim();
  const tgChat = (await getTelegramChatId().catch(() => "")).trim();

  const [tgProbe, proxy] = await Promise.all([
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
  // (см. app/api/order) — поэтому «ok» лишь когда есть оба. Причину показываем
  // явно: неверный токен / нет связи с Telegram / нет chat id.
  const telegram = !tgToken
    ? "missing"
    : tgProbe.probe === "unreachable"
      ? "unreachable"
      : tgProbe.probe === "invalid"
        ? "invalid"
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
      // Диагностика Telegram (за ?diag=<DIAG_TOKEN>): точный ответ getMe и откуда
      // взят токен — чтобы понять «неверный токен» при рабочей отправке. Токен
      // НЕ раскрываем: только длину/источник и текст ошибки Telegram.
      ...(diagOn
        ? {
            _diag: {
              telegram: {
                probe: tgProbe.probe,
                status: tgProbe.status,
                desc: tgProbe.desc,
                tokenLen: tgToken.length,
                chatSet: Boolean(tgChat),
                envTokenSet: Boolean((process.env.TELEGRAM_BOT_TOKEN ?? "").trim()),
              },
            },
          }
        : {}),
    },
    { status: ok ? 200 : 503 }
  );
}
