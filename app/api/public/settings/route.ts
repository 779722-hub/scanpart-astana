import { NextResponse } from "next/server";
import { getAllSettings } from "@/lib/sheets/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public, read-only subset of settings used by the storefront UI. */
export async function GET() {
  try {
    const all = await getAllSettings();
    return NextResponse.json({
      ok: true,
      settings: {
        expressDeliveryPrice: all.expressDeliveryPrice,
        expressHours: all.expressHours,
        pickupAddress: all.pickupAddress,
        pickupHours: all.pickupHours,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 503 }
    );
  }
}
