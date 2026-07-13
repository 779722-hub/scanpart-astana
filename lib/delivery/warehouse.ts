/**
 * Warehouse = a physical pickup point couriers collect orders from. Defined by
 * the manager in the admin panel; feeds the delivery-route builder (Phase 2).
 * Pure logic here (validation / parsing) so it is fully unit-testable.
 */
export interface Warehouse {
  id: string;
  name: string;
  address: string;
  lat: number | null;
  lng: number | null;
  pickupMinutes: number; // service time at the warehouse, minutes
  active: boolean;
  /** Supplier code this warehouse fulfils (Р1/М2/Т4…); "" if not a supplier point. */
  sourceCode: string;
  /** Marker colour on the map (hex #RRGGBB). */
  color: string;
}

export const WAREHOUSE_COLOR_DEFAULT = "#F59E0B"; // amber

/** Validate a hex colour; fall back to the amber default. */
export function normalizeColor(v: string | null | undefined, fallback = WAREHOUSE_COLOR_DEFAULT): string {
  const s = (v ?? "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(s) ? s : fallback;
}

export const PICKUP_MINUTES_DEFAULT = 15;
const PICKUP_MINUTES_MAX = 240;

/** Stable id from a name: lowercase latin/digits/dashes. */
export function slugifyId(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9а-яё]+/gi, "-")
    .replace(/^-+|-+$/g, "");
  // Transliterate is overkill; if the slug is empty (all cyrillic stripped by a
  // stricter rule) fall back to a timestamped id at the call site.
  return base.slice(0, 40);
}

/** Parse a coordinate that may use a comma decimal ("51,12" → 51.12). Empty → null. */
export function parseCoord(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).trim().replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** Split a pasted "lat, lng" pair (from 2GIS/Google Maps) into two coords. */
export function parseLatLngPair(
  s: string
): { lat: number | null; lng: number | null } {
  const parts = s.split(/[,;\s]+/).filter(Boolean);
  if (parts.length < 2) return { lat: null, lng: null };
  return { lat: parseCoord(parts[0]), lng: parseCoord(parts[1]) };
}

export interface WarehouseInput {
  id?: string;
  name?: string;
  address?: string;
  lat?: string | number | null;
  lng?: string | number | null;
  pickupMinutes?: string | number | null;
  active?: boolean;
  sourceCode?: string;
  color?: string;
}

export type ValidateResult =
  | { ok: true; warehouse: Warehouse }
  | { ok: false; error: string };

export function validateWarehouse(
  input: WarehouseInput,
  now = "1970-01-01T00:00:00.000Z"
): ValidateResult {
  const name = (input.name ?? "").trim();
  if (name.length < 2) return { ok: false, error: "name_required" };

  const lat = parseCoord(input.lat ?? null);
  const lng = parseCoord(input.lng ?? null);
  if (lat !== null && (lat < -90 || lat > 90)) return { ok: false, error: "bad_lat" };
  if (lng !== null && (lng < -180 || lng > 180)) return { ok: false, error: "bad_lng" };

  const rawMin = parseCoord(input.pickupMinutes ?? PICKUP_MINUTES_DEFAULT);
  const pickupMinutes = Math.min(
    PICKUP_MINUTES_MAX,
    Math.max(0, Math.round(rawMin ?? PICKUP_MINUTES_DEFAULT))
  );

  const id = (input.id ?? "").trim() || slugifyId(name) || `wh-${now.slice(0, 10)}`;

  return {
    ok: true,
    warehouse: {
      id,
      name,
      address: (input.address ?? "").trim(),
      lat,
      lng,
      pickupMinutes,
      active: input.active ?? true,
      sourceCode: (input.sourceCode ?? "").trim(),
      color: normalizeColor(input.color),
    },
  };
}

/** True when the warehouse has usable coordinates for routing. */
export function hasCoords(w: Warehouse): boolean {
  return w.lat !== null && w.lng !== null;
}
