/**
 * Диагностика Shate-M API. НИЧЕГО не меняет — только читает и печатает
 * реальный JSON, чтобы мы писали адаптер по фактическим ответам.
 *
 * Заполни в .env:
 *   SHATEM_BASE_URL=https://api.shate-m.kz      # базовый адрес API (уточни!)
 *   SHATEM_API_KEY=...                          # apikey из ЛК Shate-M
 *
 * Запуск (номер детали — опционально, для проверки поиска/прайса):
 *   npx tsx scripts/shatem-probe.ts
 *   npx tsx scripts/shatem-probe.ts W339055SA
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env" });

const BASE = (process.env.SHATEM_BASE_URL || "https://api.shate-m.kz").replace(/\/+$/, "");
const API_KEY = process.env.SHATEM_API_KEY || "";

function show(label: string, data: unknown) {
  console.log(`\n===== ${label} =====`);
  console.log(typeof data === "string" ? data : JSON.stringify(data, null, 2));
}

async function call(
  path: string,
  init: RequestInit & { token?: string } = {}
): Promise<{ status: number; json: unknown; text: string }> {
  const { token, ...rest } = init;
  const headers: Record<string, string> = {
    accept: "application/json",
    ...(init.body ? { "content-type": "application/json" } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...((init.headers as Record<string, string>) || {}),
  };
  const res = await fetch(`${BASE}${path}`, { ...rest, headers });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not json */
  }
  return { status: res.status, json, text };
}

async function main() {
  if (!API_KEY) {
    console.error("Нет SHATEM_API_KEY в .env — заполни и повтори.");
    process.exit(1);
  }
  console.log(`BASE = ${BASE}`);

  // 1) Авторизация по apikey — тело form-urlencoded: apikey=<KEY>.
  const auth = await call("/api/v1/auth/loginByapiKey", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: `apikey=${encodeURIComponent(API_KEY)}`,
  });
  show(`AUTH ${auth.status}`, auth.json ?? auth.text);
  const token =
    (auth.json as { access_token?: string } | null)?.access_token || "";
  if (!token) {
    console.error("\nНе получили access_token — смотри тело ответа выше.");
    process.exit(1);
  }

  // 2) Справочные данные — нужны коды для прайса и фильтра склада.
  for (const p of [
    "/api/v1/customer/info",
    "/api/v1/customer/agreements",
    "/api/v1/delivery/addresses",
    "/api/v1/locations",
  ]) {
    const r = await call(p, { token });
    show(`${p} → ${r.status}`, r.json ?? r.text);
  }

  // 3) Поиск по номеру + прайс (если передан аргумент).
  const article = process.argv[2];
  if (article) {
    const search = await call(
      `/api/v1/articles/search/${encodeURIComponent(article)}`,
      { token }
    );
    show(`articles/search/${article} → ${search.status}`, search.json ?? search.text);

    // Возьмём первый articleId из результата и запросим прайс.
    // Реальная форма: [{ article: { id, code, ... } }].
    const arr = Array.isArray(search.json)
      ? (search.json as Array<{ article?: { id?: number }; id?: number }>)
      : [];
    const ids = arr.map((x) => x?.article?.id ?? x?.id).filter((v): v is number => v != null);
    if (ids.length) {
      // agreementCode / deliveryAddressCode из аккаунта.
      const agr = await call("/api/v1/customer/agreements", { token });
      const addr = await call("/api/v1/delivery/addresses", { token });
      const agreementCode = (agr.json as Array<{ code?: string }>)?.[0]?.code;
      const deliveryAddressCode = (addr.json as Array<{ code?: string }>)?.[0]?.code;
      // Тело — МАССИВ ArticlePriceFilterKey (по ошибке рантайма). Пакетно по
      // всем найденным брендам + с аналогами.
      const price = await call("/api/v1/prices/search", {
        method: "POST",
        token,
        body: JSON.stringify(
          ids.map((articleId) => ({
            articleId,
            agreementCode,
            deliveryAddressCode,
            includeAnalogs: true,
          }))
        ),
      });
      show(`prices/search ids=[${ids.join(",")}] → ${price.status}`, price.json ?? price.text);

      // Тот же запрос, но с инфой об артикуле (бренд/код/название).
      const withInfo = await call("/api/v1/prices/search/with_article_info", {
        method: "POST",
        token,
        body: JSON.stringify(
          ids.map((articleId) => ({
            articleId,
            agreementCode,
            deliveryAddressCode,
            includeAnalogs: true,
          }))
        ),
      });
      show(`prices/search/with_article_info → ${withInfo.status}`, withInfo.json ?? withInfo.text);
    } else {
      console.log("\nНе нашли articleId в ответе поиска — структуру видно выше.");
    }
  } else {
    console.log("\n(номер детали не передан — поиск/прайс пропущены)");
  }
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
