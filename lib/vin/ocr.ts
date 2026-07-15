import { getSetting } from "@/lib/sheets/settings";
import { isVinFormatValid, normalizeVin } from "./validator";

export type OcrProvider = "gemini" | "openai";

export interface OcrConfig {
  provider: OcrProvider | "";
  geminiKey: string;
  openaiKey: string;
}

/** Read the VIN-OCR settings (provider + API keys) from the admin settings. */
export async function getOcrConfig(): Promise<OcrConfig> {
  const [provider, geminiKey, openaiKey] = await Promise.all([
    getSetting("vin_ocr_provider"),
    getSetting("gemini_api_key"),
    getSetting("openai_api_key"),
  ]);
  const p = (provider ?? "").trim().toLowerCase();
  return {
    provider: p === "gemini" || p === "openai" ? p : "",
    geminiKey: (geminiKey ?? "").trim(),
    openaiKey: (openaiKey ?? "").trim(),
  };
}

/** True when a provider is selected AND its key is present. */
export async function vinOcrEnabled(): Promise<boolean> {
  const c = await getOcrConfig().catch(() => null);
  if (!c || !c.provider) return false;
  return c.provider === "gemini" ? Boolean(c.geminiKey) : Boolean(c.openaiKey);
}

const PROMPT =
  "На изображении — свидетельство о регистрации транспортного средства (техпаспорт). " +
  "Найди VIN — идентификационный номер транспортного средства, ровно 17 символов " +
  "(латинские буквы и цифры, без букв I, O, Q). Не путай его с номером двигателя, " +
  "номером кузова/шасси, госномером или номером самого свидетельства. " +
  "Верни ТОЛЬКО VIN одной строкой, без пояснений. Если VIN не виден — верни NONE.";

function firstVin(s: string): string | null {
  const m = s.match(/[A-HJ-NPR-Z0-9]{17}/);
  if (!m) return null;
  const v = normalizeVin(m[0]);
  return isVinFormatValid(v) ? v : null;
}

/**
 * Pull a valid 17-char VIN out of the model's reply. Tries the raw text, a
 * whitespace-stripped variant, then one with the confusions a VIN can never
 * contain fixed (I→1, O→0, Q→0 — those letters are illegal in a VIN).
 */
function extractVin(text: string): string | null {
  const up = text.toUpperCase();
  const compact = up.replace(/[\s\-_.]+/g, "");
  const fixed = compact.replace(/[IÌÍ]/g, "1").replace(/[OО]/g, "0").replace(/Q/g, "0");
  return firstVin(up) ?? firstVin(compact) ?? firstVin(fixed);
}

async function callGemini(base64: string, mime: string, key: string): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(key)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [
          { parts: [{ text: PROMPT }, { inline_data: { mime_type: mime, data: base64 } }] },
        ],
        generationConfig: { temperature: 0, maxOutputTokens: 40 },
      }),
    }
  );
  if (!res.ok) {
    throw new Error(`gemini ${res.status}: ${await res.text().catch(() => "")}`);
  }
  const j = await res.json();
  const parts = j?.candidates?.[0]?.content?.parts ?? [];
  return parts.map((p: { text?: string }) => p.text ?? "").join("");
}

async function callOpenai(base64: string, mime: string, key: string): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0,
      max_tokens: 40,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: PROMPT },
            { type: "image_url", image_url: { url: `data:${mime};base64,${base64}` } },
          ],
        },
      ],
    }),
  });
  if (!res.ok) {
    throw new Error(`openai ${res.status}: ${await res.text().catch(() => "")}`);
  }
  const j = await res.json();
  return j?.choices?.[0]?.message?.content ?? "";
}

export interface RecognizeResult {
  ok: boolean;
  vin?: string;
  error?: "disabled" | "no_vin" | "provider_error";
}

/** Recognize a VIN from a base64-encoded image using the configured provider. */
export async function recognizeVin(base64: string, mime: string): Promise<RecognizeResult> {
  const cfg = await getOcrConfig();
  if (!cfg.provider) return { ok: false, error: "disabled" };
  try {
    const text =
      cfg.provider === "gemini"
        ? await callGemini(base64, mime, cfg.geminiKey)
        : await callOpenai(base64, mime, cfg.openaiKey);
    const vin = extractVin(text);
    return vin ? { ok: true, vin } : { ok: false, error: "no_vin" };
  } catch (err) {
    console.error("[vin/ocr] provider error:", (err as Error).message);
    return { ok: false, error: "provider_error" };
  }
}
