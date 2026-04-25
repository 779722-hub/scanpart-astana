import { NextRequest, NextResponse } from "next/server";
import { decodeVin } from "@/lib/vin/decoder";
import { isVinFormatValid, normalizeVin } from "@/lib/vin/validator";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("vin") ?? "";
  const vin = normalizeVin(raw);

  if (!isVinFormatValid(vin)) {
    return NextResponse.json(
      { ok: false, error: "invalid_format" },
      { status: 400 }
    );
  }

  try {
    const info = await decodeVin(vin);
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
