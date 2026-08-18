import { NextRequest, NextResponse } from "next/server";
import { resolveProxyUrl } from "@/lib/proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ВРЕМЕННЫЙ маршрут: замеряет задержки исходящих запросов ИЗ прод-окружения
// Vercel — прямой vs через прокси, чтобы понять причину медленного поиска.
// Закрыт секретом. Удалить после диагностики.
const SECRET = "4d9cbbaf89d05aa68fd9c766e6c50ac7";

async function time(label: string, url: string, useProxy: boolean, n = 3) {
  const { ProxyAgent, fetch: uf } = await import("undici");
  const proxyUrl = resolveProxyUrl("PHAETON_PROXY_URL");
  const times: number[] = [];
  let status = 0;
  let error = "";
  for (let i = 0; i < n; i++) {
    const ctrl = new AbortController();
    const tm = setTimeout(() => ctrl.abort(), 15000);
    const t0 = Date.now();
    try {
      const dispatcher =
        useProxy && proxyUrl ? new ProxyAgent(proxyUrl) : undefined;
      const res = await uf(url, {
        signal: ctrl.signal,
        dispatcher,
        headers: { accept: "*/*" },
      });
      status = res.status;
      times.push(Date.now() - t0);
    } catch (e) {
      times.push(Date.now() - t0);
      error = (e as Error).message.slice(0, 80);
    } finally {
      clearTimeout(tm);
    }
  }
  return { label, useProxy, status, error, ms: times };
}

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get("t") !== SECRET) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }
  const results = [];
  results.push(await time("phaeton_via_proxy", "https://api.phaeton.kz/", true));
  results.push(await time("shatem_direct", "https://api.shate-m.kz/api/v1/locations", false));
  results.push(await time("shatem_via_proxy", "https://api.shate-m.kz/api/v1/locations", true));
  results.push(await time("autotrade_direct", "https://sklad.autotrade.kz/login/", false));

  return NextResponse.json({
    ok: true,
    region: process.env.VERCEL_REGION ?? "(unknown)",
    results,
  });
}
