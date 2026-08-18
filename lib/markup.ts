export const MARKUP_MIN = 10;
export const MARKUP_MAX = 200;
export const MARKUP_DEFAULT = 35;

export function clampMarkup(pct: number): number {
  if (!Number.isFinite(pct)) return MARKUP_DEFAULT;
  return Math.max(MARKUP_MIN, Math.min(MARKUP_MAX, Math.round(pct)));
}

export function applyMarkup(price: number, markupPct: number): number {
  const pct = clampMarkup(markupPct);
  return Math.round(price * (1 + pct / 100));
}

// Наценка по диапазонам входящей цены поставщика. Диапазоны — основной механизм;
// общая наценка (markup_percent) — только резерв, когда цена не попала ни в один.
export const PRICE_BRACKETS_MAX = 10;
// Разумный потолок для процентной наценки диапазона (на дешёвые детали наценка
// бывает высокой, поэтому щедрее MARKUP_MAX).
export const BRACKET_PERCENT_MAX = 1000;

export type PriceBracket = {
  from: number; // включительно
  to: number | null; // исключительно; null у последнего = «и выше»
  kind: "percent" | "fixed";
  value: number;
};

/**
 * Разобрать/проверить/отсортировать массив диапазонов из настроек.
 * Принимает JSON-строку или уже распарсенный массив. Возвращает [] при отсутствии
 * или невалидном вводе. Кривые элементы игнорируются; пересечения снимаются с
 * приоритетом более раннего; не более PRICE_BRACKETS_MAX.
 */
export function parsePriceBrackets(input: unknown): PriceBracket[] {
  let arr: unknown = input;
  if (typeof input === "string") {
    if (!input.trim()) return [];
    try {
      arr = JSON.parse(input);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(arr)) return [];

  const valid: PriceBracket[] = [];
  for (const raw of arr) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const from = Number(r.from);
    const to = r.to == null || r.to === "" ? null : Number(r.to);
    const kind = r.kind === "fixed" ? "fixed" : r.kind === "percent" ? "percent" : null;
    let value = Number(r.value);
    if (!kind) continue;
    if (!Number.isFinite(from) || from < 0) continue;
    if (to !== null && (!Number.isFinite(to) || to <= from)) continue;
    if (!Number.isFinite(value) || value < 0) continue;
    if (kind === "percent") value = Math.min(value, BRACKET_PERCENT_MAX);
    valid.push({ from, to, kind, value });
  }

  valid.sort((a, b) => a.from - b.from);

  const out: PriceBracket[] = [];
  for (const b of valid) {
    const prev = out[out.length - 1];
    if (prev) {
      if (prev.to === null) break; // открытый диапазон поглощает всё дальше
      if (b.from < prev.to) continue; // пересечение → оставляем более ранний
    }
    out.push(b);
    if (out.length >= PRICE_BRACKETS_MAX) break;
  }
  return out;
}

/**
 * Цена с наценкой по диапазонам. Находит диапазон, где from <= price и
 * (to == null || price < to). percent → price*(1+value/100); fixed → price+value.
 * Если ни один не подошёл — общая наценка (applyMarkup). Диапазоны ожидаются уже
 * проверенными/отсортированными (parsePriceBrackets).
 */
export function applyBracketMarkup(
  price: number,
  brackets: PriceBracket[],
  fallbackPct: number
): number {
  for (const b of brackets) {
    if (price >= b.from && (b.to === null || price < b.to)) {
      if (b.kind === "percent") return Math.round(price * (1 + b.value / 100));
      return Math.round(price + b.value);
    }
  }
  return applyMarkup(price, fallbackPct);
}
