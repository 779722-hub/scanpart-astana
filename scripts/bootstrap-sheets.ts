/**
 * Create all required Google Sheets tabs (Settings, Orders, Users, Content,
 * ContentImages, Theme) with header rows. Idempotent.
 *
 *   npx tsx scripts/bootstrap-sheets.ts
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env" });

import { ensureSheetStructure, writeSetting, writeTheme } from "../lib/sheets/client";

async function main() {
  console.log("Ensuring sheets…");
  await ensureSheetStructure();

  console.log("Seeding default Settings…");
  const defaults: Record<string, string> = {
    markup_percent: "35",
    analogs_max: "3",
    express_delivery_price: "4000",
    express_hours: "Пн–Сб 09:00–16:00",
    pickup_address: "г. Астана, пр. Республики, 68",
    pickup_hours: "завтра 14:00–18:00",
    manager_phone_display: "",
    manager_whatsapp_e164: "",
    telegram_chat_id: "",
  };
  for (const [k, v] of Object.entries(defaults)) {
    await writeSetting(k, v);
  }

  console.log("Seeding default Theme…");
  const theme: Record<string, string> = {
    brand_color: "#E10600",
    brand_color_dark: "#FF322A",
    accent_color: "#0B0D10",
    logo_text: "SCANPART.ASTANA",
    default_theme: "system",
  };
  for (const [k, v] of Object.entries(theme)) {
    await writeTheme(k, v);
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
