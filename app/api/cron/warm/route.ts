import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/shatem/client";
import { searchBrands, searchPrices } from "@/lib/phaeton/client";
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
  // Прогрев можно дёргать: Vercel-кроном (Authorization: Bearer CRON_SECRET) —
  // недоступно на Hobby (только суточные кроны) — ИЛИ внешним планировщиком
  // (GitHub Actions / cron-job.org) по URL с ключом: /api/cron/warm?key=WARM_KEY.
  // WARM_KEY — отдельный ключ для пингера; CRON_SECRET оставлен для совместимости.
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

  // Phaeton: настоящий поиск цен (большой ответ ~230КБ), а НЕ лёгкий Dictionary —
  // только реальная загрузка «раскачивает» TCP-окно соединения через прокси КЗ,
  // иначе первый пользовательский поиск всё равно холодный (~11с) и Р1 теряется.
  const warmPhaeton = searchBrands("0986424815")
    .then((r) => {
      const b = (r.Items ?? [])[0];
      return b
        ? searchPrices({ article: b.Article, brand: b.Brand, includeAnalogs: true })
        : null;
    })
    .catch(() => null);

  const t0 = Date.now();
  const settle = await Promise.allSettled([
    getContext(), // Shate-M: логин + договор/адрес (кэш 1ч)
    warmPhaeton, // Phaeton: реальный запрос цен — греет соединение под поиск
    authedGet("/").catch(() => null), // Autotrade: держим веб-сессию
  ]);
  const status = settle.map((s) => s.status);

  return NextResponse.json({ ok: true, ms: Date.now() - t0, status });
}
