import { NextRequest, NextResponse } from "next/server";
import { fetch as undiciFetch, ProxyAgent } from "undici";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const proxy = process.env.PHAETON_PROXY_URL
  ? new ProxyAgent(process.env.PHAETON_PROXY_URL)
  : undefined;

/**
 * Token-protected Phaeton diagnostic — proxies a raw call and returns the
 * upstream JSON verbatim so we can see what the server actually returns
 * (warehouses list, error messages, etc.). Auth via DIAG_TOKEN env.
 */
export async function POST(req: NextRequest) {
  const expected = process.env.DIAG_TOKEN;
  if (!expected) {
    return NextResponse.json({ ok: false, error: "diag_disabled" }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    token?: string;
    path?: string;
    extra?: Record<string, string>;
  };
  if (body.token !== expected) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const base = process.env.PHAETON_BASE_URL || "https://api.phaeton.kz";
  const guid = process.env.PHAETON_USER_GUID;
  const key = process.env.PHAETON_API_KEY;
  if (!guid || !key) {
    return NextResponse.json(
      { ok: false, error: "missing_phaeton_env" },
      { status: 500 }
    );
  }

  const path = body.path || "/api/Dictionary";
  const qs = new URLSearchParams({ UserGuid: guid, ApiKey: key, ...(body.extra || {}) });
  const url = `${base}${path}?${qs}`;

  try {
    const res = proxy
      ? await undiciFetch(url, {
          headers: { accept: "application/json" },
          dispatcher: proxy,
        })
      : await fetch(url, {
          headers: { accept: "application/json" },
          cache: "no-store",
        });
    const text = await res.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text.slice(0, 1000);
    }
    const proxyEnv = process.env.PHAETON_PROXY_URL;
    return NextResponse.json({
      ok: res.ok,
      status: res.status,
      // Mask the URL just in case it ever leaks via screenshot.
      pathTried: path,
      params: Object.keys(body.extra || {}),
      contentType: res.headers.get("content-type"),
      body: parsed,
      proxy: {
        envSet: Boolean(proxyEnv),
        envLen: proxyEnv?.length ?? 0,
        envPrefix: proxyEnv ? proxyEnv.slice(0, 12) : null,
        agentInUse: Boolean(proxy),
      },
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}
