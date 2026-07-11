/**
 * Разведка каталожных/VIN эндпоинтов Shate-M: авторизуется и дергает
 * список кандидатов, печатает код ответа (404 = нет, 200/400/401 = есть).
 *   npx tsx scripts/shatem-catalog-probe.ts
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env" });

const BASE = (process.env.SHATEM_BASE_URL || "https://api.shate-m.kz").replace(/\/+$/, "");
const API_KEY = process.env.SHATEM_API_KEY || "";
const VIN = process.argv[2] || "JN8AS05Y37X012386";

async function main() {
  const authRes = await fetch(`${BASE}/api/v1/auth/loginByapiKey`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: `apikey=${encodeURIComponent(API_KEY)}`,
  });
  const token = ((await authRes.json()) as { access_token?: string }).access_token;
  if (!token) {
    console.error("no token");
    process.exit(1);
  }
  const H = { Authorization: `Bearer ${token}`, accept: "application/json" };

  const candidates = [
    `/api/v1/catalogs`,
    `/api/v1/catalog`,
    `/api/v1/vehicles`,
    `/api/v1/vehicles/byvin/${VIN}`,
    `/api/v1/vin/${VIN}`,
    `/api/v1/vin/search/${VIN}`,
    `/api/v1/selection/vin/${VIN}`,
    `/api/v1/cars/byvin/${VIN}`,
    `/api/v1/cars/vin/${VIN}`,
    `/api/v1/catalog/vin/${VIN}`,
    `/api/v1/catalog/cars/${VIN}`,
    `/api/v1/laximo/findvehicle?vin=${VIN}`,
    `/api/v1/garage`,
    `/api/v1/trademarks`,
  ];

  for (const path of candidates) {
    try {
      const r = await fetch(`${BASE}${path}`, { headers: H });
      const body = (await r.text()).slice(0, 160).replace(/\s+/g, " ");
      console.log(`${String(r.status).padStart(3)}  GET ${path}  ${r.status === 404 ? "" : "→ " + body}`);
    } catch (e) {
      console.log(`ERR  GET ${path}  ${(e as Error).message}`);
    }
  }
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
