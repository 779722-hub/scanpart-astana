import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { requireAuth } from "@/lib/auth/guards";
import { CONTENT_TAG, IMAGES_TAG, THEME_TAG } from "@/lib/content";
import { SETTINGS_TAG } from "@/lib/sheets/settings";

export const runtime = "nodejs";

export async function POST() {
  const guard = await requireAuth();
  if (guard instanceof NextResponse) return guard;
  revalidateTag(CONTENT_TAG);
  revalidateTag(IMAGES_TAG);
  revalidateTag(THEME_TAG);
  revalidateTag(SETTINGS_TAG);
  return NextResponse.json({
    ok: true,
    revalidated: [CONTENT_TAG, IMAGES_TAG, THEME_TAG, SETTINGS_TAG],
  });
}
