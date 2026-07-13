/** Pure helpers for the live courier-tracking view (unit-testable). */

export function minutesAgo(iso: string, nowMs: number): number | null {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((nowMs - t) / 60000));
}

/** A location older than `thresholdMin` (or missing) is considered stale. */
export function isStale(iso: string, nowMs: number, thresholdMin = 5): boolean {
  const m = minutesAgo(iso, nowMs);
  return m === null || m >= thresholdMin;
}

export function agoLabel(iso: string, nowMs: number): string {
  const m = minutesAgo(iso, nowMs);
  if (m === null) return "нет данных";
  if (m === 0) return "только что";
  if (m < 60) return `${m} мин назад`;
  return `${Math.floor(m / 60)} ч назад`;
}
