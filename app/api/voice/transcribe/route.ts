import { NextRequest, NextResponse } from "next/server";
import { transcribe } from "@/lib/voice/stt";

export const runtime = "nodejs";

const MAX_BYTES = 8 * 1024 * 1024; // ~8 MB — a few seconds of speech is far smaller

export async function POST(req: NextRequest) {
  const ctype = req.headers.get("content-type") ?? "";
  if (!ctype.includes("multipart/form-data")) {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  let base64 = "";
  let mime = "";
  let locale = "ru";
  try {
    const form = await req.formData();
    const file = form.get("audio");
    locale = String(form.get("locale") ?? "ru");
    if (!(file instanceof Blob)) {
      return NextResponse.json({ ok: false, error: "no_audio" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ ok: false, error: "too_large" }, { status: 413 });
    }
    mime = file.type || "audio/webm";
    base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
  } catch {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  const result = await transcribe(base64, mime, locale);
  if (result.ok) {
    return NextResponse.json({ ok: true, text: result.text, provider: result.provider });
  }
  const status =
    result.error === "disabled" ? 503 : result.error === "empty" ? 422 : 502;
  return NextResponse.json({ ok: false, error: result.error }, { status });
}
