import { NextRequest, NextResponse } from "next/server";
import { getPartPhotoMap, normPartKey } from "@/lib/parts/photos";
import { resolvePartImageDataUri } from "@/lib/shatem/images";

export const runtime = "nodejs";

const LOGO_PATH = "/logo.png";
// Реальное фото кэшируем надолго; фолбэк-логотип — коротко, чтобы позже
// появившееся фото подтянулось без долгого ожидания.
const CACHE_PHOTO = "public, max-age=86400, s-maxage=2592000, stale-while-revalidate=86400";
const CACHE_FALLBACK = "public, max-age=600, s-maxage=3600";

function logoRedirect(req: NextRequest): NextResponse {
  const res = NextResponse.redirect(new URL(LOGO_PATH, req.url), 302);
  res.headers.set("Cache-Control", CACHE_FALLBACK);
  return res;
}

/** Parse a `data:image/…;base64,…` URI into bytes + content-type. */
function decodeDataUri(uri: string): { buf: Buffer; type: string } | null {
  const m = /^data:([^;]+);base64,(.*)$/s.exec(uri);
  if (!m) return null;
  return { type: m[1], buf: Buffer.from(m[2], "base64") };
}

/**
 * Картинка детали для карточки результата. Приоритет:
 *   1) ручной слот `part:<артикул>` (Cloudinary) — редирект;
 *   2) фото из каталога Shate-M по артикулу (заводское, бренд производителя);
 *   3) наш логотип — если фото нигде нет.
 * Ответ кэшируется CDN Vercel по URL (?a=&b=), поэтому резолв — один раз.
 */
export async function GET(req: NextRequest) {
  const a = (req.nextUrl.searchParams.get("a") ?? "").trim();
  const b = (req.nextUrl.searchParams.get("b") ?? "").trim();
  const debug =
    process.env.DIAG_TOKEN &&
    req.nextUrl.searchParams.get("debug") === process.env.DIAG_TOKEN;
  if (!a) return logoRedirect(req);

  // 1) Ручной слот — владелец загрузил фото сам.
  const key = normPartKey(a);
  const slot = await getPartPhotoMap().catch(() => ({}) as Record<string, string>);
  if (slot[key]) {
    if (debug) return NextResponse.json({ source: "slot", url: slot[key] });
    const res = NextResponse.redirect(slot[key], 302);
    res.headers.set("Cache-Control", CACHE_PHOTO);
    return res;
  }

  // 2) Каталог Shate-M по артикулу.
  const dataUri = await resolvePartImageDataUri(a, b || undefined).catch(() => null);
  if (dataUri) {
    const decoded = decodeDataUri(dataUri);
    if (decoded) {
      if (debug)
        return NextResponse.json({ source: "shatem", type: decoded.type, bytes: decoded.buf.length });
      return new NextResponse(decoded.buf, {
        status: 200,
        headers: { "Content-Type": decoded.type, "Cache-Control": CACHE_PHOTO },
      });
    }
  }

  // 3) Фолбэк — логотип.
  if (debug) return NextResponse.json({ source: "logo" });
  return logoRedirect(req);
}
