/**
 * Сменить пароль владельца / любого админа без захода в UI.
 * Берёт BCRYPT_PEPPER, GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 и
 * SHEETS_SPREADSHEET_ID из локального .env.
 *
 *   npx tsx scripts/reset-password.ts 779722@gmail.com "НовыйПароль123ОченьДлинный"
 *
 * Если такого юзера нет в листе Users — создаст его как owner.
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env" });

import { changePassword, createUser } from "../lib/auth/users";
import { findUser } from "../lib/sheets/client";

async function main() {
  const [, , email, password] = process.argv;
  if (!email || !password) {
    console.error(
      "Usage: npx tsx scripts/reset-password.ts <email> <new-password>"
    );
    console.error("       пароль должен быть ≥ 12 символов");
    process.exit(1);
  }
  if (password.length < 12) {
    console.error("Пароль должен быть не короче 12 символов");
    process.exit(1);
  }

  const required = [
    "BCRYPT_PEPPER",
    "GOOGLE_SERVICE_ACCOUNT_JSON_BASE64",
    "SHEETS_SPREADSHEET_ID",
  ];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(
      `В .env не хватает: ${missing.join(", ")}. ` +
        `Скопируйте значения из Vercel → Settings → Environment Variables.`
    );
    process.exit(1);
  }

  const existing = await findUser(email);
  if (existing) {
    await changePassword(email, password);
    console.log(`✓ пароль для ${email} обновлён`);
  } else {
    await createUser({ email, password, role: "owner" });
    console.log(`✓ создан новый owner ${email}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
