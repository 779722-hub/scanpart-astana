import { getDictionary } from "./client";

let cached: { ids: string[]; at: number } | null = null;
const TTL = 1000 * 60 * 60 * 24; // 24h

/**
 * Resolve the list of warehouse IDs located in Astana.
 *
 * Strategy:
 * 1. If PHAETON_ASTANA_WAREHOUSE_ID env is set (comma-separated allowed) — use it.
 *    Useful for IP-whitelist dev/offline fallback.
 * 2. Otherwise query /api/Dictionary and pick entries whose Name/City/Address
 *    matches /астана|astana/i.
 *
 * Returns at least one ID; throws when nothing matches.
 */
export async function getAstanaWarehouseIds(): Promise<string[]> {
  const override = process.env.PHAETON_ASTANA_WAREHOUSE_ID;
  if (override) {
    return override.split(",").map((s) => s.trim()).filter(Boolean);
  }
  if (cached && Date.now() - cached.at < TTL) return cached.ids;

  const dict = await getDictionary();
  const warehouses = Array.isArray(dict.Warehouses) ? dict.Warehouses : [];
  const ids = warehouses
    .filter((w) => {
      const hay = `${w.Name ?? ""} ${w.City ?? ""} ${w.Address ?? ""}`;
      return /астана|astana/i.test(hay);
    })
    .map((w) => w.WarehouseId)
    .filter(Boolean);

  if (!ids.length) {
    throw new Error(
      "Astana warehouse not found in Phaeton Dictionary. " +
        "Set PHAETON_ASTANA_WAREHOUSE_ID as a fallback."
    );
  }
  cached = { ids, at: Date.now() };
  return ids;
}
