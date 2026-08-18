import { NextRequest, NextResponse } from "next/server";
import { checkProxyHealth, proxyStatusTransition } from "@/lib/proxy-health";
import { getSetting, invalidateSettings } from "@/lib/sheets/settings";
import { writeSetting } from "@/lib/sheets/client";
import { sendTelegramHtml } from "@/lib/telegram/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

/**
 * Мониторинг прокси. Внешний планировщик (GitHub Actions, рядом с keep-warm)
 * раз в ~5 минут дёргает этот эндпоинт. Он проверяет живость KZ-прокси и шлёт
 * телеграм ТОЛЬКО при смене статуса (упал / поднялся), а не на каждый пинг.
 * Последний статус хранится в настройке `proxy_status` ("up"|"down").
 *
 * Авторизация как у /api/cron/warm: ?key=WARM_KEY (или ?key=CRON_SECRET), либо
 * заголовок Authorization: Bearer CRON_SECRET. Всё fail-safe — не бросает.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const warmKey = process.env.WARM_KEY;
  const q = req.nextUrl.searchParams.get("key");
  const byHeader =
    Boolean(secret) && req.headers.get("authorization") === `Bearer ${secret}`;
  const byQuery =
    (Boolean(warmKey) && q === warmKey) || (Boolean(secret) && q === secret);
  if (!byHeader && !byQuery) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const { ok, configured } = await checkProxyHealth();
  if (!configured) return NextResponse.json({ ok: true, skipped: true });

  const now = ok ? "up" : "down";
  let changed = false;
  try {
    const prevRaw = (await getSetting("proxy_status"))?.trim();
    const prev = prevRaw === "up" || prevRaw === "down" ? prevRaw : undefined;
    const t = proxyStatusTransition(prev, now);
    changed = t.changed;

    if (t.alert === "down") {
      await sendTelegramHtml("🔴 Прокси отключён — поиск запчастей не работает");
    } else if (t.alert === "up") {
      await sendTelegramHtml("🟢 Прокси снова работает — поиск восстановлен");
    }

    if (prev !== now) {
      await writeSetting("proxy_status", now);
      invalidateSettings();
    }
  } catch {
    /* fail-safe: мониторинг не должен падать */
  }

  return NextResponse.json({ ok: true, proxy: now, changed });
}
