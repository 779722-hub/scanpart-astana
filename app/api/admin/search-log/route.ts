import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/guards";
import { clearSearchLog, listSearchLog } from "@/lib/sheets/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Журнал поисковых запросов по названию: сырой список + агрегация
 * по нормализованному запросу с подсчётом «провалов» (offers_count=0).
 */
export async function GET(req: NextRequest) {
  const guard = await requireRole("owner", "manager");
  if (guard instanceof NextResponse) return guard;

  const onlyEmpty = req.nextUrl.searchParams.get("emptyOnly") === "1";
  const rows = await listSearchLog(2000);
  const filtered = onlyEmpty ? rows.filter((r) => r.offersCount === 0) : rows;

  // Агрегация по нормализованному запросу — приводим к нижнему регистру
  // и сжимаем пробелы, чтобы «Колодки  Передние» и «колодки передние»
  // считались одной записью.
  const groups = new Map<
    string,
    {
      query: string;
      total: number;
      empty: number;
      lastTimestamp: string;
      makes: Map<string, number>;
    }
  >();
  for (const r of rows) {
    const norm = r.query.toLowerCase().replace(/\s+/g, " ").trim();
    if (!norm) continue;
    const g = groups.get(norm) ?? {
      query: r.query,
      total: 0,
      empty: 0,
      lastTimestamp: "",
      makes: new Map<string, number>(),
    };
    g.total += 1;
    if (r.offersCount === 0) g.empty += 1;
    if (r.timestamp > g.lastTimestamp) g.lastTimestamp = r.timestamp;
    if (r.make) g.makes.set(r.make, (g.makes.get(r.make) ?? 0) + 1);
    groups.set(norm, g);
  }

  const aggregated = [...groups.entries()]
    .map(([norm, g]) => ({
      norm,
      query: g.query,
      total: g.total,
      empty: g.empty,
      lastTimestamp: g.lastTimestamp,
      makes: [...g.makes.entries()]
        .map(([make, count]) => ({ make, count }))
        .sort((a, b) => b.count - a.count),
    }))
    .sort((a, b) => b.empty - a.empty || b.total - a.total);

  return NextResponse.json({ ok: true, rows: filtered, aggregated });
}

/** DELETE без тела — стирает весь журнал. Только owner. */
export async function DELETE() {
  const guard = await requireRole("owner");
  if (guard instanceof NextResponse) return guard;
  await clearSearchLog();
  return NextResponse.json({ ok: true });
}
