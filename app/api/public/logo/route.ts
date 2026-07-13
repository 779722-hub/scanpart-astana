import { NextResponse } from "next/server";
import { getImageSlot } from "@/lib/content";
import { cldUrl } from "@/lib/cloudinary-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public logo URL (Cloudinary) for standalone pages like the courier app. */
export async function GET() {
  const logo = await getImageSlot("logo").catch(() => null);
  const url = logo?.publicId ? cldUrl(logo.publicId, { width: 144 }) : null;
  return NextResponse.json({ ok: true, url });
}
