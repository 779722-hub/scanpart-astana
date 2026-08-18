/**
 * Единая точка чтения URL прокси для внешних поставщиков (Phaeton, Autotrade,
 * Shate-M, Autodoc). Все они на Vercel ходят через один фикс-IP прокси
 * (`PHAETON_PROXY_URL`, провайдер Proxy6 / px6.net), чей IP внесён в whitelist
 * Phaeton.
 *
 * ЗАЩИТА ОТ ГРАБЛЕЙ: если в переменную случайно вписали пустые кавычки (`""`),
 * пробелы или значение в кавычках — это НЕ валидный прокси. Раньше такое
 * «мусорное» значение было truthy → создавался битый ProxyAgent → КАЖДЫЙ
 * запрос падал с «Request was cancelled», и весь поиск отдавал пусто.
 * Теперь пустое/кавычки/пробелы трактуются как «прокси нет» (undefined).
 */
export function resolveProxyUrl(...envNames: string[]): string | undefined {
  for (const name of envNames) {
    let v = (process.env[name] ?? "").trim();
    // Снять одну пару обрамляющих кавычек: `""`, `''`, `"http://…"`.
    if (
      v.length >= 2 &&
      ((v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'")))
    ) {
      v = v.slice(1, -1).trim();
    }
    if (v) return v;
  }
  return undefined;
}
