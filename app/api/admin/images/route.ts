import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/guards";
import { readImages, writeImage } from "@/lib/sheets/client";
import { destroy } from "@/lib/cloudinary";
import { IMAGES_TAG } from "@/lib/content";

export const runtime = "nodejs";

export async function GET() {
  const guard = await requireAuth();
  if (guard instanceof NextResponse) return guard;
  const rows = await readImages();
  return NextResponse.json({ ok: true, rows });
}

const putSchema = z.object({
  slot: z.string().min(1).max(60),
  publicId: z.string().min(1).max(200).optional(),
  altRu: z.string().max(200).optional(),
  altKk: z.string().max(200).optional(),
  altEn: z.string().max(200).optional(),
  removePreviousPublicId: z.string().max(200).optional(),
});

export async function PUT(req: NextRequest) {
  const guard = await requireAuth();
  if (guard instanceof NextResponse) return guard;
  const parsed = putSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  }
  await writeImage(parsed.data.slot, {
    publicId: parsed.data.publicId,
    altRu: parsed.data.altRu,
    altKk: parsed.data.altKk,
    altEn: parsed.data.altEn,
  });
  if (parsed.data.removePreviousPublicId) {
    destroy(parsed.data.removePreviousPublicId).catch((err) =>
      console.warn("[images] failed to remove previous:", err.message)
    );
  }
  revalidateTag(IMAGES_TAG);
  return NextResponse.json({ ok: true });
}
