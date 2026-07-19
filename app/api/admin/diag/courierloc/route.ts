import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { upsertCourierLocation, readCourierLocations } from "@/lib/sheets/client";
import { google } from "googleapis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function client() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 || "";
  const creds = JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
  const auth = new google.auth.JWT(creds.client_email, undefined, creds.private_key, [
    "https://www.googleapis.com/auth/spreadsheets",
  ]);
  return google.sheets({ version: "v4", auth });
}

export async function POST() {
  const guard = await requireAuth();
  if (guard instanceof NextResponse) return guard;
  const out: Record<string, unknown> = {};
  const id = process.env.SHEETS_SPREADSHEET_ID || "";
  const sheets = client();

  try {
    const meta = await sheets.spreadsheets.get({ spreadsheetId: id });
    out.tabs = (meta.data.sheets ?? []).map((s) => s.properties?.title);
  } catch (e) {
    out.tabs = `ERR: ${(e as Error).message}`;
  }

  try {
    await upsertCourierLocation("c-test-kur", 51.1345, 71.43);
    out.upsert = "ok";
  } catch (e) {
    out.upsert = `ERR: ${(e as Error).message}`;
  }

  try {
    const raw = await sheets.spreadsheets.values.get({ spreadsheetId: id, range: "CourierLocations!A1:D20" });
    out.raw = raw.data.values ?? [];
  } catch (e) {
    out.raw = `ERR: ${(e as Error).message}`;
  }

  try {
    out.rows = await readCourierLocations();
  } catch (e) {
    out.rows = `ERR: ${(e as Error).message}`;
  }
  return NextResponse.json(out);
}
