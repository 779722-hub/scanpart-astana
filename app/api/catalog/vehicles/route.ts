import { NextRequest, NextResponse } from "next/server";
import { wizardVehicles } from "@/lib/shatem/catalog";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const catalogId = req.nextUrl.searchParams.get("catalogId") ?? "";
  const ssd = req.nextUrl.searchParams.get("ssd") ?? "";
  if (!catalogId || !ssd) {
    return NextResponse.json({ ok: false, error: "missing" }, { status: 400 });
  }
  try {
    const list = await wizardVehicles(catalogId, ssd);
    // Only expose what the picker needs.
    const vehicles = list.map((v) => ({
      vehicleId: v.vehicleId,
      brand: v.brand,
      name: v.name,
      engine: v.engine ?? "",
      market: v.market ?? "",
      ssd: v.ssd,
      catalog: v.catalog,
    }));
    return NextResponse.json({ ok: true, vehicles });
  } catch (err) {
    console.warn("[api/catalog/vehicles]", (err as Error).message);
    return NextResponse.json({ ok: false, vehicles: [] }, { status: 503 });
  }
}
