import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Proxy to NHTSA getmodelsformake — returns the list of model names that
 * the NHTSA database knows for a given manufacturer.
 *   GET /api/vin/models?make=Toyota
 *   → { ok: true, models: ["Camry", "Corolla", "RAV4", …] }
 */
export async function GET(req: NextRequest) {
  const make = (req.nextUrl.searchParams.get("make") ?? "").trim();
  if (!make || make.length > 60) {
    return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  }
  try {
    const res = await fetch(
      `https://vpic.nhtsa.dot.gov/api/vehicles/getmodelsformake/${encodeURIComponent(
        make
      )}?format=json`,
      { headers: { accept: "application/json" }, next: { revalidate: 60 * 60 * 24 * 30 } }
    );
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: "upstream" }, { status: 503 });
    }
    const json = (await res.json()) as {
      Results?: Array<{ Model_Name?: string }>;
    };
    const models = Array.from(
      new Set(
        (json.Results ?? [])
          .map((r) => r.Model_Name?.trim() ?? "")
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b));
    return NextResponse.json({ ok: true, make, models });
  } catch (err) {
    console.error("[api/vin/models]", (err as Error).message);
    return NextResponse.json(
      { ok: false, error: "service_unavailable" },
      { status: 503 }
    );
  }
}
