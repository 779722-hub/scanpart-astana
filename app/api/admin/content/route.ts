import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/guards";
import { readContent, writeContent, writeContentWhere } from "@/lib/sheets/client";
import { CONTENT_TAG } from "@/lib/content";
import { translationConfigured, translateRuToKkEn } from "@/lib/translate";

export const runtime = "nodejs";

export async function GET() {
  const guard = await requireAuth();
  if (guard instanceof NextResponse) return guard;
  const rows = await readContent();
  return NextResponse.json({ ok: true, rows });
}

const putSchema = z.object({
  key: z.string().min(1).max(120),
  locale: z.enum(["ru", "kk", "en"]).optional(),
  value: z.string().max(2000).optional(),
  where: z.string().max(300).optional(),
});

export async function PUT(req: NextRequest) {
  const guard = await requireAuth();
  if (guard instanceof NextResponse) return guard;
  const parsed = putSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  }
  let translations: { kk: string; en: string } | undefined;
  if (parsed.data.locale && parsed.data.value !== undefined) {
    await writeContent(
      parsed.data.key,
      parsed.data.locale,
      parsed.data.value,
      guard.email
    );
    // Editing Russian is the source of truth — auto-translate into KK/EN.
    // Skip structured (JSON array/object) values so they don't get corrupted.
    const val = parsed.data.value;
    if (
      parsed.data.locale === "ru" &&
      val.trim() &&
      !/^\s*[[{]/.test(val) &&
      translationConfigured()
    ) {
      try {
        const t = await translateRuToKkEn(val);
        await writeContent(parsed.data.key, "kk", t.kk, guard.email);
        await writeContent(parsed.data.key, "en", t.en, guard.email);
        translations = t;
      } catch (err) {
        console.warn("[content] auto-translate failed:", (err as Error).message);
      }
    }
  }
  if (parsed.data.where !== undefined) {
    await writeContentWhere(parsed.data.key, parsed.data.where);
  }
  revalidateTag(CONTENT_TAG);
  return NextResponse.json({ ok: true, translations });
}
