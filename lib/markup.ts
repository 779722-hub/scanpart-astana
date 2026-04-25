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
