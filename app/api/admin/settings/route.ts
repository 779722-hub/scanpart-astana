import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/guards";
import { readSetting, writeSetting } from "@/lib/sheets/client";

export const runtime = "nodejs";

export async function GET() {
  const guard = await requireAuth();
  if (guard instanceof NextResponse) return guard;
  const map = await readSetting();
  return NextResponse.json({ ok: true, settings: map });
}

const putSchema = z.object({
  patch: z.record(z.string(), z.string().max(2000)),
});

export async function PUT(req: NextRequest) {
  const guard = await requireAuth();
  if (guard instanceof NextResponse) return guard;
  const parsed = putSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  }
  for (const [k, v] of Object.entries(parsed.data.patch)) {
    await writeSetting(k, v);
  }
  return NextResponse.json({ ok: true });
}
