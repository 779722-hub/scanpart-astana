import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { catalogGet } from "@/lib/shatem/web-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Гибкая разведка каталога: дёргаем произвольный путь через web-сессию.
export async function POST(req: NextRequest) {
  const guard = await requireAuth();
  if (guard instanceof NextResponse) return guard;
  const body = (await req.json().catch(() => ({}))) as { paths?: string[] };
  const paths = body.paths ?? [];
  const out: Record<string, unknown> = {};
  for (const p of paths.slice(0, 12)) {
    try {
      const r = await catalogGet<unknown>(p);
      out[p] = JSON.stringify(r).slice(0, 500);
    } catch (e) {
      out[p] = `err: ${(e as Error).message.slice(0, 140)}`;
    }
  }
  return NextResponse.json({ out });
}
