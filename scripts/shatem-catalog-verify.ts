/**
 * Проверка каталог-клиента целиком: VIN + название → OEM-кандидаты для авто.
 *   npx tsx scripts/shatem-catalog-verify.ts JN8AS05Y37X012386 колодки
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env" });

import { articlesByVinAndName } from "../lib/shatem/catalog";

async function main() {
  const vin = process.argv[2] || "JN8AS05Y37X012386";
  const name = process.argv.slice(3).join(" ") || "колодки";
  const { vehicle, parts } = await articlesByVinAndName(vin, name);
  console.log(`\nАвто: ${vehicle ? `${vehicle.brand} ${vehicle.name} (${vehicle.catalog})` : "не найдено"}`);
  console.log(`Запрос: "${name}" → ${parts.length} OEM-кандидатов\n`);
  for (const p of parts) {
    console.log(`${p.oem.padEnd(16)} ${p.name}${p.applicableModels ? `   [${p.applicableModels}]` : ""}`);
  }
}

main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
