import { makeCache } from "@/lib/cache";
import { isVinFormatValid, normalizeVin } from "./validator";

export interface VehicleInfo {
  make: string;
  model: string;
  year: string;
  bodyClass?: string;
  fuelType?: string;
}

const cache = makeCache<VehicleInfo>({ ttlMs: 1000 * 60 * 60 * 24 * 7 }); // 7 days

const NHTSA_URL =
  "https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/";
const NHTSA_WMI_URL = "https://vpic.nhtsa.dot.gov/api/vehicles/DecodeWMI/";

export async function decodeVin(input: string): Promise<VehicleInfo | null> {
  const vin = normalizeVin(input);
  if (!isVinFormatValid(vin)) return null;

  const cached = cache.get(vin);
  if (cached) return cached;

  const res = await fetch(`${NHTSA_URL}${encodeURIComponent(vin)}?format=json`, {
    headers: { accept: "application/json" },
    next: { revalidate: 60 * 60 * 24 * 7 },
  });
  if (!res.ok) return null;

  const json = (await res.json()) as {
    Results?: Array<{
      Make?: string;
      Model?: string;
      ModelYear?: string;
      BodyClass?: string;
      FuelTypePrimary?: string;
      ErrorCode?: string;
    }>;
  };
  const r = json.Results?.[0];
  if (r?.Make && r.Model && r.ModelYear) {
    const info: VehicleInfo = {
      make: r.Make,
      model: r.Model,
      year: r.ModelYear,
      bodyClass: r.BodyClass || undefined,
      fuelType: r.FuelTypePrimary || undefined,
    };
    cache.set(vin, info);
    return info;
  }

  // Fallback: try WMI lookup (first 3 chars). Returns at least the make.
  const partial = await decodeWmi(vin.slice(0, 3));
  if (partial) {
    cache.set(vin, partial);
    return partial;
  }
  return null;
}

async function decodeWmi(wmi: string): Promise<VehicleInfo | null> {
  if (!/^[A-HJ-NPR-Z0-9]{3}$/i.test(wmi)) return null;
  try {
    const res = await fetch(`${NHTSA_WMI_URL}${encodeURIComponent(wmi)}?format=json`, {
      headers: { accept: "application/json" },
      next: { revalidate: 60 * 60 * 24 * 30 },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      Results?: Array<{ Name?: string; VehicleType?: string; Country?: string }>;
    };
    const r = json.Results?.[0];
    if (!r?.Name) return null;
    return {
      make: r.Name,
      model: "—",
      year: "—",
      bodyClass: r.VehicleType || undefined,
    };
  } catch {
    return null;
  }
}
