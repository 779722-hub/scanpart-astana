import { NextRequest, NextResponse } from "next/server";
import { fetch as undiciFetch, ProxyAgent } from "undici";
import { requireAuth } from "@/lib/auth/guards";
import { searchBrands, searchPrices } from "@/lib/phaeton/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const proxy = process.env.PHAETON_PROXY_URL
  ? new ProxyAgent(process.env.PHAETON_PROXY_URL)
  : undefined;

async function tryUrl(url: string): Promise<{ url: string; status: number; type: string; len: number }> {
  try {
    const res = proxy
      ? await undiciFetch(url, { dispatcher: proxy })
      : await fetch(url, { cache: "no-store" });
    const buf = Buffer.from(await res.arrayBuffer());
    return {
      url: url.replace(/ApiKey=[^&]+/i, "ApiKey=***").replace(/UserGuid=[^&]+/i, "UserGuid=***"),
      status: res.status,
      type: res.headers.get("content-type") || "",
      len: buf.length,
    };
  } catch (err) {
    return { url, status: -1, type: (err as Error).message.slice(0, 60), len: 0 };
  }
}

// Разведка: берём реальный ItemId и пробуем угадать URL/эндпоинт фото Phaeton.
export async function POST(req: NextRequest) {
  const guard = await requireAuth();
  if (guard instanceof NextResponse) return guard;
  const body = (await req.json().catch(() => ({}))) as { article?: string };
  const article = body.article || "GDB1330";

  const brands = await searchBrands(article);
  const brand = brands.Items?.[0]?.Brand || "";
  const prices = await searchPrices({ article, brand, includeAnalogs: false });
  const item = (prices.Items?.[0] ?? {}) as unknown as Record<string, unknown>;
  const itemId = String(item.ItemId ?? "");
  const categoryId = String(item.CategoryId ?? "");
  const supplierId = String(item.SupplierId ?? "");

  const base = process.env.PHAETON_BASE_URL || "https://api.phaeton.kz";
  const auth = `UserGuid=${process.env.PHAETON_USER_GUID}&ApiKey=${process.env.PHAETON_API_KEY}`;
  const candidates: string[] = itemId
    ? [
        `${base}/api/Photo?ItemId=${itemId}&${auth}`,
        `${base}/api/Photo/${itemId}?${auth}`,
        `${base}/api/Image?ItemId=${itemId}&${auth}`,
        `${base}/api/GetPhoto?ItemId=${itemId}&${auth}`,
        `${base}/api/Search/Photo?ItemId=${itemId}&${auth}`,
        `${base}/api/PhotoItem?ItemId=${itemId}&${auth}`,
        `${base}/Photo/${itemId}.jpg`,
        `${base}/images/${itemId}.jpg`,
        `${base}/upload/iblock/${itemId}.jpg`,
        `https://phaeton.kz/upload/${itemId}.jpg`,
        `https://static.phaeton.kz/${itemId}.jpg`,
        `https://img.phaeton.kz/${itemId}.jpg`,
      ]
    : [];

  const results = [];
  for (const u of candidates) results.push(await tryUrl(u));

  return NextResponse.json({
    article,
    brand,
    itemId,
    categoryId,
    supplierId,
    itemKeys: Object.keys(item),
    results,
  });
}
