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
import { ProxyAgent } from "undici";

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

/**
 * САМОВОССТАНОВЛЕНИЕ ПРОКСИ. Все поставщики ходят через один KZ-прокси. Агент
 * кешируется по URL прокси на всё время жизни тёплого инстанса Vercel. Если
 * прокси падает и ПОДНИМАЕТСЯ обратно, старый агент держит мёртвый туннель и
 * все запросы продолжают падать — раньше это лечилось только ручным редеплоем.
 * Теперь клиент на connection-ошибке зовёт `resetProxyAgent(...)`, кеш чистится,
 * и следующий `getProxyAgent(...)` строит свежий агент, переподключаясь к
 * восстановленному прокси — без редеплоя.
 */
const _agents = new Map<string, ProxyAgent>();

/**
 * Кешированный ProxyAgent для первого заданного env-имени с валидным URL.
 * `undefined`, если прокси не настроен (dev/прямой fetch) — поведение прежнее.
 */
export function getProxyAgent(...envNames: string[]): ProxyAgent | undefined {
  const url = resolveProxyUrl(...envNames);
  if (!url) return undefined;
  let agent = _agents.get(url);
  if (!agent) {
    agent = new ProxyAgent(url);
    _agents.set(url, agent);
  }
  return agent;
}

/**
 * Выселить кешированный агент для этого прокси (после connection-ошибки) и
 * уничтожить его мёртвый туннель. Следующий `getProxyAgent` соберёт новый.
 */
export function resetProxyAgent(...envNames: string[]): void {
  const url = resolveProxyUrl(...envNames);
  if (!url) return;
  const agent = _agents.get(url);
  if (!agent) return;
  _agents.delete(url);
  // best-effort: закрыть сокеты мёртвого туннеля, ошибки не важны.
  agent.destroy().catch(() => {});
}

/**
 * TRUE только для connection-уровневых сбоев, означающих, что ТУННЕЛЬ прокси
 * мёртв (прокси недоступен / оборвал соединение). Именно на них мы сбрасываем
 * кешированный агент, чтобы переподключиться к восстановленному прокси.
 *
 * НЕ трогаем здоровый агент из-за обычного таймаута НАШЕГО запроса к рабочему
 * туннелю: `AbortError`/«This operation was aborted» — это наш setTimeout на
 * медленный ответ цели, а не смерть прокси; для него возвращаем FALSE, чтобы не
 * плодить лишние переподключения. Исключение — «Request was cancelled» undici,
 * которым как раз проявляется битый/уничтоженный ProxyAgent-туннель.
 *
 * undici оборачивает реальную причину, поэтому смотрим и `err.message`, и
 * `err.cause?.code` / `err.cause?.message`.
 */
export function isProxyConnError(err: unknown): boolean {
  const parts: string[] = [];
  const collect = (e: unknown, depth: number) => {
    if (!e || depth > 3) return;
    if (typeof e === "string") {
      parts.push(e);
      return;
    }
    if (typeof e === "object") {
      const o = e as { message?: unknown; code?: unknown; cause?: unknown };
      if (typeof o.message === "string") parts.push(o.message);
      if (typeof o.code === "string") parts.push(o.code);
      if (o.cause) collect(o.cause, depth + 1);
    }
  };
  collect(err, 0);
  const hay = parts.join(" | ");

  // connection-уровень: туннель прокси мёртв → сбрасываем агент.
  return /ECONNREFUSED|ECONNRESET|ECONNABORTED|ENOTFOUND|EAI_AGAIN|socket hang up|other side closed|fetch failed|Request was cancelled|UND_ERR_CONNECT_TIMEOUT|Connect Timeout|ETIMEDOUT/i.test(
    hay
  );
}
