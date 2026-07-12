/**
 * 4-digit handover code: issued to the customer (via WhatsApp) when the courier
 * sets a delivery "en route". At handover the courier asks for the code and the
 * customer's code must match — proof the parcel reached the right person.
 * Pure comparison here; generation lives in the route (needs runtime RNG).
 */

/** Keep only digits; a valid code is exactly 4 digits. */
export function normalizeCode(input: string): string {
  return (input || "").replace(/\D/g, "").slice(0, 4);
}

export function isValidCode(code: string): boolean {
  return /^\d{4}$/.test(code);
}

/** Constant-time-ish equality of two 4-digit codes after normalisation. */
export function codesMatch(a: string, b: string): boolean {
  const x = normalizeCode(a);
  const y = normalizeCode(b);
  if (!isValidCode(x) || !isValidCode(y)) return false;
  let diff = 0;
  for (let i = 0; i < 4; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}
