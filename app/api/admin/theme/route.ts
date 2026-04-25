import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/guards";
import { readTheme, writeTheme } from "@/lib/sheets/client";
import { THEME_TAG } from "@/lib/content";

export const runtime = "nodejs";

export async function GET() {
  const guard = await requireAuth();
  if (guard instanceof NextResponse) return guard;
  const map = await readTheme();
  return NextResponse.json({ ok: true, theme: map });
}

const HEX = /^#[0-9a-fA-F]{6}$/;
const putSchema = z.object({
  patch: z.record(z.string(), z.string().max(120)),
});

export async function PUT(req: NextRequest) {
  const guard = await requireAuth();
  if (guard instanceof NextResponse) return guard;
  const parsed = putSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  }
  for (const [k, v] of Object.entries(parsed.data.patch)) {
    // basic guard for color fields
    if (k.endsWith("_color") && !HEX.test(v)) {
      return NextResponse.json(
        { ok: false, error: "bad_hex", key: k },
        { status: 400 }
      );
    }
    await writeTheme(k, v);
  }
  revalidateTag(THEME_TAG);
  return NextResponse.json({ ok: true });
}
