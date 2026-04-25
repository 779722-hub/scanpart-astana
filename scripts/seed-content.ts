/**
 * Seed Google Sheets `Content` from messages/{ru,kk,en}.json.
 *
 * Run once after creating the spreadsheet:
 *   npx tsx scripts/seed-content.ts
 *
 * Re-running is safe: existing rows are updated, new ones appended.
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env" });

import ru from "../messages/ru.json";
import kk from "../messages/kk.json";
import en from "../messages/en.json";
import { ensureSheetStructure, writeContent } from "../lib/sheets/client";

type AnyJson = Record<string, unknown>;

function flatten(obj: AnyJson, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v == null) continue;
    if (typeof v === "string") {
      out[key] = v;
    } else if (Array.isArray(v)) {
      // Stringify arrays as JSON to keep round-trip; admins can edit as JSON.
      out[key] = JSON.stringify(v);
    } else if (typeof v === "object") {
      Object.assign(out, flatten(v as AnyJson, key));
    }
  }
  return out;
}

async function main() {
  console.log("Ensuring sheet structure…");
  await ensureSheetStructure();

  const flatRu = flatten(ru as AnyJson);
  const flatKk = flatten(kk as AnyJson);
  const flatEn = flatten(en as AnyJson);

  const allKeys = new Set([
    ...Object.keys(flatRu),
    ...Object.keys(flatKk),
    ...Object.keys(flatEn),
  ]);

  console.log(`Seeding ${allKeys.size} keys…`);
  let i = 0;
  for (const key of allKeys) {
    if (flatRu[key]) await writeContent(key, "ru", flatRu[key], "seed-script");
    if (flatKk[key]) await writeContent(key, "kk", flatKk[key], "seed-script");
    if (flatEn[key]) await writeContent(key, "en", flatEn[key], "seed-script");
    i++;
    if (i % 10 === 0) console.log(`  ${i}/${allKeys.size}`);
  }
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
