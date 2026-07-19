import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { vehicleByFrame, vehicleByVin } from "@/lib/shatem/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Разведка поиска по Frame: пробуем разные разбиения на firstFrame/twoFrame.
export async function POST(req: NextRequest) {
  const guard = await requireAuth();
  if (guard instanceof NextResponse) return guard;
  const body = (await req.json().catch(() => ({}))) as { frame?: string };
  const frame = (body.frame || "NZE121-3151986").trim().toUpperCase();

  // Кандидаты разбиения: по дефису, и «первые 6 vs остальное».
  const nodash = frame.replace(/[\s-]/g, "");
  const dash = frame.split(/[-\s]/).filter(Boolean);
  const splits: Array<[string, string]> = [];
  if (dash.length >= 2) splits.push([dash[0], dash.slice(1).join("")]);
  splits.push([nodash.slice(0, 6), nodash.slice(6)]);
  splits.push([nodash.slice(0, 5), nodash.slice(5)]);

  const results: Record<string, unknown> = {};
  // as VIN (текущее поведение)
  try {
    const v = await vehicleByVin(nodash);
    results["asVin"] = v ? { brand: v.brand, name: v.name, catalog: v.catalog } : null;
  } catch (e) {
    results["asVin"] = `err: ${(e as Error).message.slice(0, 80)}`;
  }
  for (const [f, t] of splits) {
    const key = `frame[${f}|${t}]`;
    try {
      const r = await vehicleByFrame(f, t);
      results[key] = {
        isWizard: r.isWizard,
        count: r.vehicles?.length ?? 0,
        first: r.vehicles?.[0]
          ? { brand: r.vehicles[0].brand, name: r.vehicles[0].name, catalog: r.vehicles[0].catalog }
          : null,
      };
    } catch (e) {
      results[key] = `err: ${(e as Error).message.slice(0, 80)}`;
    }
  }
  return NextResponse.json({ frame, results });
}
