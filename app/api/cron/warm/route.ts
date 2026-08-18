import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/shatem/client";
import { getDictionary } from "@/lib/phaeton/client";
import { authedGet } from "@/lib/autotrade/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Keep-warm: раз в несколько минут (Vercel-крон) прогревает инстанс и кэши
 * авторизации поставщиков (Shate-M токен+контекст, Autotrade веб-сессия,
 * Phaeton/прокси-соединение). Без этого первый поиск после простоя — «холодный»:
 * все поставщики логинятся заново через прокси КЗ, и запрос тянется ~40-50с.
 * С прогревом пользователь почти всегда попадает на «тёплый» путь (~4-6с).
 *
 * Всё fail-safe: любые ошибки поставщиков глотаем — задача лишь не дать
 * инстансу и токенам «остыть».
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const isCron =
    Boolean(secret) && req.headers.get("authorization") === `Bearer ${secret}`;
  if (!isCron) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const t0 = Date.now();
  const settle = await Promise.allSettled([
    getContext(), // Shate-M: логин + договор/адрес (кэш 1ч)
    getDictionary().catch(() => null), // Phaeton: держим прокси-соединение тёплым
    authedGet("/").catch(() => null), // Autotrade: держим веб-сессию
  ]);
  const status = settle.map((s) => s.status);

  return NextResponse.json({ ok: true, ms: Date.now() - t0, status });
}
