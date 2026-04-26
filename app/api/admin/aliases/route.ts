import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/guards";
import {
  appendAlias,
  deleteAlias,
  listAliases,
  updateAlias,
} from "@/lib/sheets/client";
import { invalidateAliasCache } from "@/lib/aliases";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requireRole("owner", "manager");
  if (guard instanceof NextResponse) return guard;
  const rows = await listAliases();
  return NextResponse.json({ ok: true, rows });
}

export async function POST(req: NextRequest) {
  const guard = await requireRole("owner", "manager");
  if (guard instanceof NextResponse) return guard;
  const user = guard;
  const body = await req.json().catch(() => ({}));
  const query = String(body?.query ?? "").trim();
  const make = String(body?.make ?? "").trim();
  const articles = String(body?.articles ?? "").trim();
  if (!query || !articles) {
    return NextResponse.json(
      { ok: false, error: "query_and_articles_required" },
      { status: 400 }
    );
  }
  await appendAlias({ query, make, articles, by: user.email });
  invalidateAliasCache();
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest) {
  const guard = await requireRole("owner", "manager");
  if (guard instanceof NextResponse) return guard;
  const user = guard;
  const body = await req.json().catch(() => ({}));
  const rowNumber = Number(body?.rowNumber);
  if (!Number.isInteger(rowNumber) || rowNumber < 2) {
    return NextResponse.json({ ok: false, error: "invalid_row" }, { status: 400 });
  }
  const patch: { query?: string; make?: string; articles?: string; by: string } = {
    by: user.email,
  };
  if (typeof body?.query === "string") patch.query = body.query.trim();
  if (typeof body?.make === "string") patch.make = body.make.trim();
  if (typeof body?.articles === "string") patch.articles = body.articles.trim();
  await updateAlias(rowNumber, patch);
  invalidateAliasCache();
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const guard = await requireRole("owner", "manager");
  if (guard instanceof NextResponse) return guard;
  const body = await req.json().catch(() => ({}));
  const rowNumber = Number(body?.rowNumber);
  if (!Number.isInteger(rowNumber) || rowNumber < 2) {
    return NextResponse.json({ ok: false, error: "invalid_row" }, { status: 400 });
  }
  await deleteAlias(rowNumber);
  invalidateAliasCache();
  return NextResponse.json({ ok: true });
}
