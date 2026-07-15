/**
 * Разведка Autotrade: логинится по кредам из .env, дергает поиск по артикулу и
 * сохраняет реальный HTML выдачи в scratchpad — по нему пишется парсер.
 *   npx tsx scripts/autotrade-probe.ts [артикул]
 *
 * Нужны в .env: AUTOTRADE_LOGIN, AUTOTRADE_PASSWORD (+ опц. AUTOTRADE_PROXY_URL).
 */
import { config as loadEnv } from "dotenv";
import { writeFileSync } from "node:fs";
loadEnv({ path: ".env" });

import { authedGet, articleSearchUrl, autotradeConfigured } from "../lib/autotrade/session";

const ARTICLE = process.argv[2] || "AN605WK";

async function main() {
  if (!autotradeConfigured()) {
    console.error(
      "Autotrade не настроен: добавьте AUTOTRADE_LOGIN и AUTOTRADE_PASSWORD в .env"
    );
    process.exit(1);
  }
  const url = articleSearchUrl(ARTICLE);
  console.log("→ GET", url);
  const res = await authedGet(url);
  console.log("status:", res.status, "| final url:", res.url, "| html:", res.html.length, "байт");

  const loggedOut = /\/login\/?$/.test(res.url) || new URL(res.url).pathname === "/";
  console.log(loggedOut ? "⚠️  Похоже, НЕ залогинены (редирект)." : "✓ Похоже, залогинены.");

  const out = "scripts/.autotrade-search.html";
  writeFileSync(out, res.html, "utf8");
  console.log("HTML сохранён в", out);

  // Быстрые маркеры структуры, чтобы понять, как парсить.
  const markers = ["price", "цена", "brand", "бренд", "article", "артикул", "product", "tovar", "search-result", "data-"];
  for (const m of markers) {
    const n = res.html.toLowerCase().split(m.toLowerCase()).length - 1;
    if (n) console.log(`  «${m}» встречается ${n}×`);
  }
}

main().catch((e) => {
  console.error("Ошибка:", e);
  process.exit(1);
});
