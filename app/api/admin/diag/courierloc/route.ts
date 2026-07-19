import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { readCourierLocations, readCouriers } from "@/lib/sheets/client";
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

export async function GET() {
  const guard = await requireAuth();
  if (guard instanceof NextResponse) return guard;
  const out: Record<string, unknown> = {};
  const id = process.env.SHEETS_SPREADSHEET_ID || "";
  const sheets = client();
  try {
    const raw = await sheets.spreadsheets.values.get({ spreadsheetId: id, range: "CourierLocations!A1:D30" });
    out.rawRows = raw.data.values ?? [];
  } catch (e) {
    out.rawRows = `ERR: ${(e as Error).message}`;
  }
  try {
    out.parsedLocations = await readCourierLocations();
  } catch (e) {
    out.parsedLocations = `ERR: ${(e as Error).message}`;
  }
  try {
    out.couriers = (await readCouriers()).map((c) => ({ id: c.id, name: c.name, login: c.login, active: c.active }));
  } catch (e) {
    out.couriers = `ERR: ${(e as Error).message}`;
  }
  return NextResponse.json(out);
}
