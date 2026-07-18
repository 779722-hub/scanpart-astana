import { NextRequest, NextResponse } from "next/server";
import { getPartPhotoMap, normPartKey } from "@/lib/parts/photos";
import { resolvePartImageDataUri } from "@/lib/shatem/images";
import { resolveAutotradePhotoUrl } from "@/lib/autotrade/images";
import { phaetonImageUrl } from "@/lib/phaeton/product-image";
import { signedFetchUrl } from "@/lib/cloudinary";

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

/** Забрать байты картинки по URL (сервер-сайд — домен поставщика не утекает). */
async function serveRemoteImage(url: string): Promise<NextResponse | null> {
  const r = await fetch(url, { cache: "no-store" }).catch(() => null);
  if (!r || !r.ok) return null;
  const type = r.headers.get("content-type") || "image/jpeg";
  if (!type.startsWith("image/")) return null;
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length < 200) return null; // пустышка/заглушка
  return new NextResponse(buf, {
    status: 200,
    headers: { "Content-Type": type, "Cache-Control": CACHE_PHOTO },
  });
}

/**
 * Отдать удалённую картинку с ресайзом через Cloudinary (лёгкая + кэш), а если
 * fetch в аккаунте не разрешён — фолбэк на прямой (полноразмерный) URL.
 */
async function serveResized(remoteUrl: string, size: number): Promise<NextResponse | null> {
  const signed = signedFetchUrl(remoteUrl, size);
  if (signed) {
    const viaCloudinary = await serveRemoteImage(signed);
    if (viaCloudinary) return viaCloudinary;
  }
  return serveRemoteImage(remoteUrl);
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
 *   2) фото Autotrade по артикулу — чистое (без вотермарка), актуальное;
 *   3) фото каталога Phaeton по бренду+артикулу (публичное, студийное HQ);
 *   4) каталог Shate-M по артикулу (заводское, бренд производителя);
 *   5) наш логотип — если фото нигде нет.
 * При `rel=1` (сопутствующий товар) пропускается только Shate-M (подбор по
 * коду даёт ложные фото); Autotrade и Phaeton ищут по точному бренду+артикулу,
 * поэтому безопасны.
 * Ответ кэшируется CDN Vercel по URL, поэтому резолв — один раз.
 */
export async function GET(req: NextRequest) {
  const a = (req.nextUrl.searchParams.get("a") ?? "").trim();
  const b = (req.nextUrl.searchParams.get("b") ?? "").trim();
  const rel = req.nextUrl.searchParams.get("rel") === "1";
  // Размер: миниатюра ~400, лайтбокс запрашивает крупнее (?s=1000). Клампим.
  const sRaw = Number(req.nextUrl.searchParams.get("s"));
  const size = Number.isFinite(sRaw) ? Math.min(1600, Math.max(100, sRaw)) : 400;
  if (!a) return logoRedirect(req);

  // 1) Ручной слот — владелец загрузил фото сам.
  const key = normPartKey(a);
  const slot = await getPartPhotoMap().catch(() => ({}) as Record<string, string>);
  if (slot[key]) {
    const res = NextResponse.redirect(slot[key], 302);
    res.headers.set("Cache-Control", CACHE_PHOTO);
    return res;
  }

  // 2) Фото Autotrade по артикулу (чистый URL без вотермарка).
  const atUrl = await resolveAutotradePhotoUrl(a, b || undefined).catch(() => null);
  if (atUrl) {
    const served = await serveResized(atUrl, size);
    if (served) return served;
  }

  // 3) Фото каталога Phaeton по бренду+артикулу (публичный файл, студийное HQ).
  const phUrl = phaetonImageUrl(a, b || undefined);
  if (phUrl) {
    const served = await serveResized(phUrl, size);
    if (served) return served;
  }

  // 4) Каталог Shate-M по артикулу (кроме сопутствующих).
  if (!rel) {
    // Картинки Shate-M низкого разрешения — при запросе крупного размера
    // апскейлятся и мылятся. Капаем, чтобы оставались чёткими (примерно как
    // фото Autotrade по видимому размеру).
    const shatemSize = Math.min(size, 500);
    const dataUri = await resolvePartImageDataUri(a, b || undefined, shatemSize).catch(() => null);
    if (dataUri) {
      const decoded = decodeDataUri(dataUri);
      if (decoded) {
        return new NextResponse(decoded.buf, {
          status: 200,
          headers: { "Content-Type": decoded.type, "Cache-Control": CACHE_PHOTO },
        });
      }
    }
  }

  // 4) Фолбэк — логотип.
  return logoRedirect(req);
}
