import { NextRequest, NextResponse } from "next/server";
import { checkProxyHealth, proxyStatusTransition } from "@/lib/proxy-health";
import {
  probePhaeton,
  probeShatem,
  probeAutotrade,
  probeInterkom,
  type SupplierHealth,
} from "@/lib/monitoring";
import { getSetting, invalidateSettings } from "@/lib/sheets/settings";
import { writeSetting } from "@/lib/sheets/client";
import { sendTelegramHtml } from "@/lib/telegram/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Реальные пробы 4 поставщиков (поиск сентинелов через прокси) параллельно —
// на холодном инстансе несколько секунд, даём запас.
export const maxDuration = 60;

// Читаемые ярлыки для телеграма (только внутренние — код+имя допустимы).
const SUPPLIER_LABEL: Record<string, string> = {
  phaeton: "Phaeton (Р1)",
  shatem: "Shate-M (М2)",
  autotrade: "Autotrade (Т3)",
  interkom: "Interkom (И6)",
};

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

  // Честные пробы всех поставщиков. Все ходят через тот же прокси: если он лёг —
  // пробы НЕ запускаем (иначе поймаем «down» у всех и продублируем алерт прокси).
  // Тогда статусы поставщиков остаются прежними, а дашборд (/api/health) сам
  // покажет их как «не работает», пока прокси лежит (оверлей proxyDown). Когда
  // прокси жив, каждый поставщик проверяется отдельно и алертит на СМЕНЕ статуса
  // — так видно, ЧТО именно сломано (напр. прокси жив, а Р1 или И6 молчит).
  const suppliers: Record<string, string> = {};
  try {
    if (now === "up") {
      const probes: Array<[string, SupplierHealth]> = await Promise.all([
        probePhaeton().then((h) => ["phaeton", h] as [string, SupplierHealth]),
        probeShatem().then((h) => ["shatem", h] as [string, SupplierHealth]),
        probeAutotrade().then((h) => ["autotrade", h] as [string, SupplierHealth]),
        probeInterkom().then((h) => ["interkom", h] as [string, SupplierHealth]),
      ]);
      for (const [key, h] of probes) {
        // Не настроен или выключен тумблером — не трогаем статус и не алертим.
        if (!h.configured || h.disabled) continue;
        const snow = h.ok ? "up" : "down";
        suppliers[key] = snow;
        const prevRaw = (await getSetting(`${key}_status`))?.trim();
        const prev = prevRaw === "up" || prevRaw === "down" ? prevRaw : undefined;
        const t = proxyStatusTransition(prev, snow);
        if (t.alert === "down") {
          await sendTelegramHtml(
            `🔴 ${SUPPLIER_LABEL[key]} не работает${
              h.error ? ` (${h.error})` : ""
            } — проверьте доступ поставщика (логин/сессия/склад)`
          );
        } else if (t.alert === "up") {
          await sendTelegramHtml(`🟢 ${SUPPLIER_LABEL[key]} снова работает`);
        }
        if (prev !== snow) {
          await writeSetting(`${key}_status`, snow);
          invalidateSettings();
        }
      }
    }
  } catch {
    /* fail-safe */
  }

  return NextResponse.json({ ok: true, proxy: now, suppliers, changed });
}
