/**
 * Проверка каталога Shate-M (Laximo) по цепочке VIN → авто → узлы.
 * Каталог авторизуется СЕССИОННОЙ КУКОЙ (не apikey). Для проверки положи
 * текущую куку залогиненного ЛК во временную переменную:
 *
 *   SHATEM_WEB_BASE=https://shate-m.kz
 *   SHATEM_SESSION_COOKIE=<строка Cookie из заголовка запроса AutoByVin>
 *
 * Запуск:  npx tsx scripts/shatem-catalog-vin-probe.ts JN8AS05Y37X012386
 *
 * Кука короткоживущая — это только для верификации форм ответа, не для прода.
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env" });

const WEB = (process.env.SHATEM_WEB_BASE || "https://shate-m.kz").replace(/\/+$/, "");
const COOKIE = process.env.SHATEM_SESSION_COOKIE || "";
const VIN = process.argv[2] || "JN8AS05Y37X012386";

function show(label: string, data: unknown) {
  console.log(`\n===== ${label} =====`);
  console.log(typeof data === "string" ? data : JSON.stringify(data, null, 2));
}

async function get(path: string): Promise<{ status: number; json: unknown; text: string }> {
  const res = await fetch(`${WEB}${path}`, {
    headers: {
      accept: "application/json",
      cookie: COOKIE,
      "x-requested-with": "XMLHttpRequest",
    },
  });
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
  if (!COOKIE) {
    console.error("Нет SHATEM_SESSION_COOKIE в .env — вставь куку и повтори.");
    process.exit(1);
  }
  console.log(`WEB = ${WEB}\nVIN = ${VIN}`);

  // Шаг 1 — VIN → авто.
  const auto = await get(
    `/vin/api/v1/laximoExtended/AutoByVin?vin=${encodeURIComponent(VIN)}&catalogId=&ssd=&firstFrame=&twoFrame=`
  );
  show(`AutoByVin → ${auto.status}`, auto.json ?? auto.text.slice(0, 400));

  const v = (auto.json as { vehicles?: Array<Record<string, unknown>> } | null)?.vehicles?.[0];
  if (!v) {
    console.error("\nНет vehicles в ответе — структура выше. Возможно кука протухла (401).");
    process.exit(1);
  }
  const vehicleId = v.vehicleId as string | number;
  const catalog = v.catalog as string;
  const ssd = v.ssd as string;
  console.log(`\n→ vehicleId=${vehicleId} catalog=${catalog} ssd.len=${String(ssd ?? "").length}`);

  // Шаг 2 — авто → узлы/категории.
  const groups = await get(
    `/vin/api/v1/laximoExtended/GetVinGroups?vehicleId=${encodeURIComponent(
      String(vehicleId)
    )}&catalog=${encodeURIComponent(catalog)}&ssd=${encodeURIComponent(ssd)}`
  );
  // Печатаем компактно: ключи верхнего уровня + размеры массивов.
  const g = groups.json as Record<string, unknown> | null;
  if (g) {
    const summary: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(g)) {
      summary[k] = Array.isArray(val) ? `Array(${val.length})` : val;
    }
    show(`GetVinGroups → ${groups.status} (структура)`, summary);
    show("treeData[0..2]", (g.treeData as unknown[] | undefined)?.slice(0, 3));
    show("dataCategory[0..2]", (g.dataCategory as unknown[] | undefined)?.slice(0, 3));
    show("vendorData[0..2]", (g.vendorData as unknown[] | undefined)?.slice(0, 3));
  } else {
    show(`GetVinGroups → ${groups.status}`, groups.text.slice(0, 400));
  }
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
