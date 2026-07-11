/**
 * Проверка высокоуровневого нормализатора Shate-M: код → PartOffer[]
 * (только Астана + в наличии, с наценкой).
 *   npx tsx scripts/shatem-verify.ts OC90
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env" });

import { searchShatemOffers } from "../lib/shatem/search";

async function main() {
  const code = process.argv[2] || "OC90";
  const offers = await searchShatemOffers(code, { markupPct: 35 });
  console.log(`\n${code}: ${offers.length} офферов (Астана + в наличии)\n`);
  for (const o of offers.slice(0, 12)) {
    console.log(
      `${o.brand.padEnd(16)} ${o.article.padEnd(14)} ` +
        `${String(o.priceRaw).padStart(7)} → ${String(o.priceFinal).padStart(7)} ₸  ` +
        `x${o.quantity}  ${o.inStockNow ? "в наличии" : `${o.shipmentDays}д`}  ${o.name}`
    );
  }
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
