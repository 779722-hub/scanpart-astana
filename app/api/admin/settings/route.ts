import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/guards";
import { readSetting, writeSetting } from "@/lib/sheets/client";
import { invalidateSettings } from "@/lib/sheets/settings";

export const runtime = "nodejs";

// Secret credentials — never returned to the browser, and only overwritten when
// a real new value is provided (an empty PUT value keeps the stored secret).
const SECRET_KEYS = [
  "telegram_bot_token",
  "gemini_api_key",
  "openai_api_key",
  "openrouter_api_key",
] as const;

export async function GET() {
  const guard = await requireAuth();
  if (guard instanceof NextResponse) return guard;
  const map = await readSetting();
  // Redact secrets: return whether each is set, but never the value itself.
  const secretsSet: Record<string, boolean> = {};
  for (const k of SECRET_KEYS) {
    secretsSet[k] = Boolean((map[k] ?? "").trim());
    if (k in map) map[k] = "";
  }
  return NextResponse.json({ ok: true, settings: map, secretsSet });
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
    // Empty value for a secret means "keep as-is" — don't wipe the stored key.
    if ((SECRET_KEYS as readonly string[]).includes(k) && !v.trim()) continue;
    await writeSetting(k, v);
  }
  // Settings feed statically rendered pages (home, /info) — drop their cache so
  // the change shows up without waiting for a redeploy.
  invalidateSettings();
  return NextResponse.json({ ok: true });
}
