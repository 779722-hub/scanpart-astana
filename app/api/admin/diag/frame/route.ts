import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { catalogGet, catalogGetText } from "@/lib/shatem/web-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const guard = await requireAuth();
  if (guard instanceof NextResponse) return guard;
  const body = (await req.json().catch(() => ({}))) as {
    paths?: string[];
    text?: string[];
    grep?: string;
  };
  const out: Record<string, unknown> = {};

  for (const p of (body.paths ?? []).slice(0, 12)) {
    try {
      out[p] = JSON.stringify(await catalogGet<unknown>(p)).slice(0, 4000);
    } catch (e) {
      out[p] = `err: ${(e as Error).message.slice(0, 140)}`;
    }
  }

  for (const p of (body.text ?? []).slice(0, 8)) {
    try {
      const { status, text } = await catalogGetText(p);
      if (body.grep) {
        const re = new RegExp(`.{0,60}${body.grep}.{0,90}`, "gi");
        const hits = Array.from(text.matchAll(re), (m) => m[0].replace(/\s+/g, " ")).slice(0, 25);
        out[`text:${p}`] = { status, len: text.length, hits };
      } else {
        // Список путей к JS-бандлам.
        const scripts = Array.from(text.matchAll(/(?:src|href)="([^"]+\.js[^"]*)"/gi), (m) => m[1]).slice(0, 25);
        out[`text:${p}`] = { status, len: text.length, scripts };
      }
    } catch (e) {
      out[`text:${p}`] = `err: ${(e as Error).message.slice(0, 140)}`;
    }
  }

  return NextResponse.json({ out });
}
