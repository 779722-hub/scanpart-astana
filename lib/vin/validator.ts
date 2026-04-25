const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/i;

const TRANSLIT: Record<string, number> = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8,
  J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9,
  S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
};
const WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

export function normalizeVin(input: string): string {
  return input.replace(/\s+/g, "").toUpperCase();
}

export function isVinFormatValid(vin: string): boolean {
  return VIN_RE.test(vin);
}

/**
 * NHTSA checksum applies strictly to North-American VINs; many European/Asian
 * manufacturers ignore it. We return true when checksum passes OR when the
 * first WMI character suggests a non-NA origin (not a reliable rejection).
 */
export function hasPlausibleChecksum(vin: string): boolean {
  if (!isVinFormatValid(vin)) return false;
  const up = vin.toUpperCase();
  let sum = 0;
  for (let i = 0; i < 17; i++) {
    const ch = up[i];
    const val = /[0-9]/.test(ch) ? Number(ch) : TRANSLIT[ch];
    if (val == null) return false;
    sum += val * WEIGHTS[i];
  }
  const check = sum % 11;
  const expected = check === 10 ? "X" : String(check);
  if (up[8] === expected) return true;
  // Non-NA VIN (first char not 1-5 A-E) — checksum is informational.
  return !/^[1-5A-E]/.test(up);
}
