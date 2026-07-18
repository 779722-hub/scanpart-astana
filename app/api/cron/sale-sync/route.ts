import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { syncSaleChunk } from "@/lib/phaeton/sale";
import { getCurrentUser } from "@/lib/auth/guards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Один прогон синхронизации распродажи. Вызывается Vercel-кроном (Authorization:
 * Bearer CRON_SECRET) или админом из кнопки «Обновить распродажу» (сессия).
 * Каждый прогон добавляет ~40 страниц; за несколько прогонов покрытие полное.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const isCron = Boolean(secret) && req.headers.get("authorization") === `Bearer ${secret}`;
  const isAdmin = !isCron && Boolean(await getCurrentUser().catch(() => null));
  if (!isCron && !isAdmin) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  try {
    const res = await syncSaleChunk();
    revalidateTag("sale");
    return NextResponse.json({ ok: true, ...res });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
