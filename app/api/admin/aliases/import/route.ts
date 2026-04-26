import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/guards";
import { bulkAppendAliases } from "@/lib/sheets/client";
import { invalidateAliasCache } from "@/lib/aliases";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Массовый импорт записей словаря синонимов из CSV/TSV-текста.
 *
 * Принимает body { text: "..." }. Каждая непустая строка =
 * `query<DELIM>make<DELIM>articles`, где DELIM = TAB или `;` (запятая
 * не используется потому, что она встречается внутри articles).
 * Заголовочная строка с «query» / «запрос» автоматически пропускается.
 */
const HEADER_RE = /^(query|запрос)\b/i;

interface ParsedRow {
  query: string;
  make: string;
  articles: string;
}

function parseImportText(text: string): { rows: ParsedRow[]; skipped: string[] } {
  const out: ParsedRow[] = [];
  const skipped: string[] = [];
  const lines = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const line of lines) {
    if (HEADER_RE.test(line)) continue; // header
    if (!line.includes("\t")) {
      skipped.push(`нет TAB: ${line.slice(0, 60)}`);
      continue;
    }
    // TSV: первые два TAB-а делят query / make / articles. Всё после
    // второго TAB остаётся в articles как есть — там могут быть запятые,
    // точки с запятой, что угодно.
    const idx1 = line.indexOf("\t");
    const idx2 = line.indexOf("\t", idx1 + 1);
    if (idx2 < 0) {
      skipped.push(`мало колонок: ${line.slice(0, 60)}`);
      continue;
    }
    const query = line.slice(0, idx1).trim();
    const make = line.slice(idx1 + 1, idx2).trim();
    const articles = line.slice(idx2 + 1).trim();
    if (!query || !articles) {
      skipped.push(`пустой query/articles: ${line.slice(0, 60)}`);
      continue;
    }
    out.push({ query, make, articles });
  }
  return { rows: out, skipped };
}

export async function POST(req: NextRequest) {
  const guard = await requireRole("owner", "manager");
  if (guard instanceof NextResponse) return guard;
  const user = guard;
  const body = await req.json().catch(() => ({}));
  const text = String(body?.text ?? "");
  if (!text.trim()) {
    return NextResponse.json({ ok: false, error: "empty" }, { status: 400 });
  }
  const { rows, skipped } = parseImportText(text);
  if (!rows.length) {
    return NextResponse.json(
      { ok: false, error: "no_valid_rows", skipped },
      { status: 400 }
    );
  }
  const inserted = await bulkAppendAliases(rows, user.email);
  invalidateAliasCache();
  return NextResponse.json({ ok: true, inserted, skipped });
}
