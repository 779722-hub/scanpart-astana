import { NextRequest, NextResponse } from "next/server";
import { checkProxyHealth, proxyStatusTransition } from "@/lib/proxy-health";
import { checkPhaetonSearchHealth } from "@/lib/phaeton/health";
import { getSetting, invalidateSettings } from "@/lib/sheets/settings";
import { writeSetting } from "@/lib/sheets/client";
import { sendTelegramHtml } from "@/lib/telegram/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Реальная проба Phaeton (searchBrands+searchPrices по сентинелам через прокси)
// может занять несколько секунд на холодном инстансе — даём запас.
export const maxDuration = 40;

/**
 * ЧЕСТНЫЙ мониторинг поиска. Внешний планировщик (GitHub Actions, рядом с
 * keep-warm) раз в ~5 минут дёргает этот эндпоинт. Он:
 *  1) проверяет живость KZ-прокси (общий канал всех поставщиков);
 *  2) РЕАЛЬНО проверяет выдачу Phaeton (Р1) — не пинг корня, а поиск сентинелов
 *     через прокси со счётом остатка в Астане (ловит и «прокси жив, но Р1 молчит»,
 *     как инцидент 2026-09-18: whitelist/смена формата склада).
 * Телеграм шлёт ТОЛЬКО при смене статуса (упал/поднялся), не на каждый пинг.
 * Последние статусы хранятся в настройках `proxy_status` и `phaeton_status`
 * ("up"|"down"), их и показывает дашборд.
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

  // Phaeton (Р1) — честная проба выдачи. Если прокси лёг, Р1 всё равно не
  // отдаёт: отражаем это в статусе, но БЕЗ отдельного телеграма (алерт прокси
  // уже покрывает — не дублируем). Отдельный phaeton-алерт нужен для случая
  // «прокси жив, а Р1 молчит».
  let phaeton: string | undefined;
  try {
    if (now === "down") {
      const prevPh = (await getSetting("phaeton_status"))?.trim();
      if (prevPh !== "down") {
        await writeSetting("phaeton_status", "down");
        invalidateSettings();
      }
      phaeton = "down";
    } else {
      const ph = await checkPhaetonSearchHealth();
      if (ph.configured) {
        const pnow = ph.ok ? "up" : "down";
        phaeton = pnow;
        const prevRaw = (await getSetting("phaeton_status"))?.trim();
        const prev = prevRaw === "up" || prevRaw === "down" ? prevRaw : undefined;
        const t = proxyStatusTransition(prev, pnow);
        if (t.alert === "down") {
          await sendTelegramHtml(
            `🔴 Phaeton (Р1) не отдаёт запчасти со склада Астаны${
              ph.error ? ` (${ph.error})` : ""
            } — проверьте whitelist IP на Phaeton и склад Астаны`
          );
        } else if (t.alert === "up") {
          await sendTelegramHtml("🟢 Phaeton (Р1) снова отдаёт запчасти со склада Астаны");
        }
        if (prev !== pnow) {
          await writeSetting("phaeton_status", pnow);
          invalidateSettings();
        }
      }
    }
  } catch {
    /* fail-safe */
  }

  return NextResponse.json({ ok: true, proxy: now, phaeton, changed });
}
