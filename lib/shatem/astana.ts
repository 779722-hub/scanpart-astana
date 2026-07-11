import { getLocations } from "./client";

let cached: { codes: string[]; at: number } | null = null;
const TTL = 1000 * 60 * 60 * 24; // 24h

/**
 * Resolve Shate-M location codes located in Astana.
 *
 * 1. If SHATEM_ASTANA_LOCATION_CODE env is set (comma-separated allowed) — use it.
 * 2. Otherwise query /locations and pick entries whose name/city matches
 *    /астана|astana/i.
 *
 * Returns [] when nothing matches (caller decides how strict to be); logs a warn.
 */
export async function getAstanaLocationCodes(): Promise<string[]> {
  const override = process.env.SHATEM_ASTANA_LOCATION_CODE;
  if (override) {
    return override.split(",").map((s) => s.trim()).filter(Boolean);
  }
  if (cached && Date.now() - cached.at < TTL) return cached.codes;

  const locations = await getLocations();
  const codes = locations
    .filter((l) => /астана|astana/i.test(`${l.name ?? ""} ${l.city ?? ""}`))
    .map((l) => l.code)
    .filter(Boolean);

  if (!codes.length) {
    console.warn(
      "[shatem] Astana location not found in /locations. " +
        "Set SHATEM_ASTANA_LOCATION_CODE as a fallback."
    );
  }
  cached = { codes, at: Date.now() };
  return codes;
}
