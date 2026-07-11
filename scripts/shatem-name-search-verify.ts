/**
 * Воспроизводит Shate-M-путь поиска ПО НАЗВАНИЮ для авто, как в /api/search:
 *   VIN + название → OEM из каталога → цена/наличие по Астане (Shate-M).
 *   npx tsx scripts/shatem-name-search-verify.ts JN8AS05Y37X012386 колодки
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env" });

import { articlesByVinAndName } from "../lib/shatem/catalog";
import { searchShatemOffers } from "../lib/shatem/search";

async function main() {
  const vin = process.argv[2] || "JN8AS05Y37X012386";
  const name = process.argv.slice(3).join(" ") || "колодки";
  const markupPct = 35;

  const { vehicle, parts } = await articlesByVinAndName(vin, name);
  console.log(`Авто: ${vehicle ? `${vehicle.brand} ${vehicle.name}` : "?"}  |  "${name}" → OEM: ${parts.map((p) => p.oem).join(", ") || "—"}`);

  const lists = await Promise.all(
    parts.map((p) => searchShatemOffers(p.oem, { markupPct }).catch(() => []))
  );
  const offers = lists.flat();
  console.log(`\nОфферы Shate-M (Астана + в наличии): ${offers.length}\n`);
  for (const o of offers.slice(0, 20)) {
    console.log(`${o.brand.padEnd(16)} ${o.article.padEnd(14)} ${String(o.priceFinal).padStart(7)} ₸  x${o.quantity}  ${o.name}`);
  }
}

main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
