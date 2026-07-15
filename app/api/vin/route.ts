import { NextRequest, NextResponse } from "next/server";
import { decodeVin, type VehicleInfo } from "@/lib/vin/decoder";
import { isVinAcceptable, normalizeVin } from "@/lib/vin/validator";
import { vehicleByVin } from "@/lib/shatem/catalog";

export const runtime = "nodejs";

function shatemWebConfigured(): boolean {
  return Boolean(
    (process.env.SHATEM_WEB_LOGIN && process.env.SHATEM_WEB_PASSWORD) ||
      process.env.SHATEM_SESSION_COOKIE
  );
}

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("vin") ?? "";
  const vin = normalizeVin(raw);
  // `fast=1` skips the slow Shate-M catalog and uses only the cached NHTSA
  // decode — enough for labelling saved cars ("Infiniti FX35") in the cabinet.
  const fast = req.nextUrl.searchParams.get("fast") === "1";

  if (!isVinAcceptable(vin)) {
    return NextResponse.json(
      { ok: false, error: "invalid_format" },
      { status: 400 }
    );
  }

  try {
    // Prefer the Shate-M catalog (accurate KZ-market data + enables VIN parts
    // search). Fall back to NHTSA when unconfigured or when Shate-M has no hit.
    let info: VehicleInfo | null = null;
    if (!fast && shatemWebConfigured()) {
      info = await vehicleByVin(vin)
        .then((v) =>
          v
            ? ({
                make: v.brand,
                model: v.name,
                year: v.date?.match(/\d{4}/)?.[0] ?? "",
                bodyClass: v.attributes?.find((a) => a.key === "bodyStyle")?.value,
                fuelType: v.engine,
              } satisfies VehicleInfo)
            : null
        )
        .catch((err) => {
          console.warn("[api/vin] shatem decode failed:", (err as Error).message);
          return null;
        });
    }
    if (!info) info = await decodeVin(vin);
    if (!info) {
      return NextResponse.json(
        { ok: false, error: "not_found", vin },
        { status: 404 }
      );
    }
    return NextResponse.json({ ok: true, vin, vehicle: info });
  } catch (err) {
    console.error("[api/vin] decode error", err);
    return NextResponse.json(
      { ok: false, error: "service_unavailable" },
      { status: 503 }
    );
  }
}
