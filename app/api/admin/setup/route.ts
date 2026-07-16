import { NextRequest, NextResponse } from "next/server";
import {
  ensureSheetStructure,
  bulkWriteSettings,
  bulkWriteTheme,
  bulkWriteContent,
  type ContentRow,
} from "@/lib/sheets/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_SETTINGS: Record<string, string> = {
  markup_percent: "35",
  analogs_max: "3",
  express_delivery_price: "4000",
  express_hours: "Пн–Сб 09:00–16:00",
  pickup_address: "г. Астана, пр. Республики, 68",
  pickup_hours: "завтра 14:00–18:00",
  manager_phone_display: "",
  manager_whatsapp_e164: "",
  telegram_chat_id: "",
};

const DEFAULT_THEME: Record<string, string> = {
  brand_color: "#E10600",
  brand_color_dark: "#FF322A",
  accent_color: "#0B0D10",
  logo_text: "SCANPART.ASTANA",
  default_theme: "system",
};

type AnyJson = Record<string, unknown>;

function flatten(obj: AnyJson, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v == null) continue;
    if (typeof v === "string") out[key] = v;
    else if (Array.isArray(v)) out[key] = JSON.stringify(v);
    else if (typeof v === "object") Object.assign(out, flatten(v as AnyJson, key));
  }
  return out;
}

/**
 * One-shot bootstrap: creates all required sheet tabs with headers, seeds
 * default Settings + Theme, and migrates messages/{ru,kk,en}.json into the
 * Content sheet. Uses bulk writes (one API call per sheet section) to avoid
 * Sheets API quota limits.
 *
 * Protected by BOOTSTRAP_TOKEN. After successful run, clear the env var.
 */
export async function POST(req: NextRequest) {
  const expected = process.env.BOOTSTRAP_TOKEN;
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: "bootstrap_disabled" },
      { status: 403 }
    );
  }
  const body = (await req.json().catch(() => ({}))) as { token?: string };
  if (body.token !== expected) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  try {
    await ensureSheetStructure();
    await bulkWriteSettings(DEFAULT_SETTINGS);
    await bulkWriteTheme(DEFAULT_THEME);

    const ru = (await import("@/messages/ru.json")).default as AnyJson;
    const kk = (await import("@/messages/kk.json")).default as AnyJson;
    const en = (await import("@/messages/en.json")).default as AnyJson;
    const flatRu = flatten(ru);
    const flatKk = flatten(kk);
    const flatEn = flatten(en);
    const allKeys = new Set([
      ...Object.keys(flatRu),
      ...Object.keys(flatKk),
      ...Object.keys(flatEn),
    ]);

    const rows: ContentRow[] = [...allKeys].sort().map((key) => ({
      key,
      ru: flatRu[key] ?? "",
      kk: flatKk[key] ?? "",
      en: flatEn[key] ?? "",
    }));
    await bulkWriteContent(rows);

    return NextResponse.json({
      ok: true,
      sheetsCreated: ["Settings", "Orders", "Users", "Content", "ContentImages", "Theme"],
      defaultsSeeded: {
        settings: Object.keys(DEFAULT_SETTINGS).length,
        theme: Object.keys(DEFAULT_THEME).length,
      },
      contentRows: rows.length,
    });
  } catch (err) {
    console.error("[setup]", (err as Error).message);
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}
