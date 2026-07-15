import { NextRequest, NextResponse } from "next/server";
import { recognizeVin } from "@/lib/vin/ocr";

export const runtime = "nodejs";

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB — a downscaled phone photo is far smaller

export async function POST(req: NextRequest) {
  let base64 = "";
  let mime = "";
  const ctype = req.headers.get("content-type") ?? "";

  try {
    if (ctype.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("image");
      if (!(file instanceof Blob)) {
        return NextResponse.json({ ok: false, error: "no_image" }, { status: 400 });
      }
      if (file.size > MAX_BYTES) {
        return NextResponse.json({ ok: false, error: "too_large" }, { status: 413 });
      }
      mime = file.type || "image/jpeg";
      base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    } else {
      const body = await req.json();
      const m = String(body?.image ?? "").match(/^data:([^;]+);base64,(.+)$/);
      if (!m) {
        return NextResponse.json({ ok: false, error: "no_image" }, { status: 400 });
      }
      mime = m[1];
      base64 = m[2];
      if (base64.length > MAX_BYTES * 1.4) {
        return NextResponse.json({ ok: false, error: "too_large" }, { status: 413 });
      }
    }
  } catch {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  if (!/^image\//.test(mime)) {
    return NextResponse.json({ ok: false, error: "no_image" }, { status: 400 });
  }

  const result = await recognizeVin(base64, mime);
  if (result.ok) {
    return NextResponse.json({ ok: true, vin: result.vin, provider: result.provider });
  }
  const status =
    result.error === "disabled" ? 503 : result.error === "no_vin" ? 422 : 502;
  return NextResponse.json({ ok: false, error: result.error }, { status });
}
