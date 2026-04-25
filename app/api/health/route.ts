import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VERSION = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? process.env.GITHUB_SHA?.slice(0, 7) ?? "dev";

async function checkUrl(url: string, timeoutMs = 4000): Promise<boolean> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
    return res.ok || res.status === 401 || res.status === 403; // any reachable answer counts
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

export async function GET() {
  const phaetonBase = process.env.PHAETON_BASE_URL || "https://api.phaeton.kz";
  const [phaetonOk, sheetsConfigured] = await Promise.all([
    checkUrl(`${phaetonBase}/`),
    Promise.resolve(
      Boolean(
        process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 &&
          process.env.SHEETS_SPREADSHEET_ID
      )
    ),
  ]);

  const ok = phaetonOk;
  return NextResponse.json(
    {
      ok,
      version: VERSION,
      timestamp: new Date().toISOString(),
      checks: {
        phaeton: phaetonOk ? "ok" : "fail",
        sheets: sheetsConfigured ? "configured" : "missing",
        cloudinary: process.env.CLOUDINARY_CLOUD_NAME ? "configured" : "missing",
        telegram: process.env.TELEGRAM_BOT_TOKEN ? "configured" : "missing",
      },
    },
    { status: ok ? 200 : 503 }
  );
}
