import { readSetting } from "@/lib/sheets/client";
import { getSetting } from "@/lib/sheets/settings";
import { isVinFormatValid, normalizeVin } from "./validator";

export type OcrProvider = "gemini" | "openai";

export interface OcrConfig {
  provider: OcrProvider | "";
  geminiKey: string;
  openaiKey: string;
}

const REQUEST_TIMEOUT_MS = 25_000;

function parseConfig(map: Record<string, string | undefined>): OcrConfig {
  const p = (map.vin_ocr_provider ?? "").trim().toLowerCase();
  return {
    provider: p === "gemini" || p === "openai" ? p : "",
    geminiKey: (map.gemini_api_key ?? "").trim(),
    openaiKey: (map.openai_api_key ?? "").trim(),
  };
}

/** Read the VIN-OCR settings (provider + API keys). Cached (~60s) via getSetting. */
export async function getOcrConfig(): Promise<OcrConfig> {
  const [provider, geminiKey, openaiKey] = await Promise.all([
    getSetting("vin_ocr_provider"),
    getSetting("gemini_api_key"),
    getSetting("openai_api_key"),
  ]);
  return parseConfig({
    vin_ocr_provider: provider,
    gemini_api_key: geminiKey,
    openai_api_key: openaiKey,
  });
}

/** Fresh (uncached) config — used by the admin "test keys" check right after saving. */
async function getOcrConfigFresh(): Promise<OcrConfig> {
  return parseConfig(await readSetting());
}

/** True when a provider is selected AND its key is present. */
export async function vinOcrEnabled(): Promise<boolean> {
  const c = await getOcrConfig().catch(() => null);
  if (!c || !c.provider) return false;
  return c.provider === "gemini" ? Boolean(c.geminiKey) : Boolean(c.openaiKey);
}

const PROMPT =
  "На изображении — свидетельство о регистрации транспортного средства (техпаспорт), " +
  "возможно казахстанское, где поля пронумерованы. Найди VIN — идентификационный номер " +
  "транспортного средства, ровно 17 символов (латинские буквы и цифры, без букв I, O, Q). " +
  "На казахстанских свидетельствах VIN обычно указан в поле под номером 5 (VIN / номер кузова). " +
  "Не путай его с номером двигателя, номером шасси, госномером или номером самого свидетельства. " +
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
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
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
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
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
  provider?: OcrProvider;
  error?: "disabled" | "no_vin" | "provider_error";
}

/**
 * Recognize a VIN from an image. Tries the selected provider first; if it errors
 * or times out, automatically falls back to the other provider (when its key is
 * set). A successful reply with no VIN does NOT fall back — that's an image
 * problem, not a provider outage, and a second call would only waste money.
 */
export async function recognizeVin(base64: string, mime: string): Promise<RecognizeResult> {
  const cfg = await getOcrConfig();
  if (!cfg.provider) return { ok: false, error: "disabled" };

  const order: OcrProvider[] =
    cfg.provider === "gemini" ? ["gemini", "openai"] : ["openai", "gemini"];
  const attempts = order
    .map((provider) => ({
      provider,
      key: provider === "gemini" ? cfg.geminiKey : cfg.openaiKey,
    }))
    .filter((a) => a.key);

  if (!attempts.length) return { ok: false, error: "disabled" };

  let lastError: NonNullable<RecognizeResult["error"]> = "provider_error";
  for (const a of attempts) {
    try {
      const text =
        a.provider === "gemini"
          ? await callGemini(base64, mime, a.key)
          : await callOpenai(base64, mime, a.key);
      const vin = extractVin(text);
      if (vin) return { ok: true, vin, provider: a.provider };
      return { ok: false, error: "no_vin", provider: a.provider };
    } catch (err) {
      console.error(`[vin/ocr] ${a.provider} failed:`, (err as Error).message);
      lastError = "provider_error";
      // fall through to the next provider
    }
  }
  return { ok: false, error: lastError };
}

export interface KeyStatus {
  configured: boolean;
  ok: boolean;
}
export interface OcrKeysReport {
  provider: OcrProvider | "";
  gemini: KeyStatus;
  openai: KeyStatus;
}

async function pingGemini(key: string): Promise<KeyStatus> {
  if (!key) return { configured: false, ok: false };
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`,
      { signal: AbortSignal.timeout(15_000) }
    );
    return { configured: true, ok: res.ok };
  } catch {
    return { configured: true, ok: false };
  }
}

async function pingOpenai(key: string): Promise<KeyStatus> {
  if (!key) return { configured: false, ok: false };
  try {
    const res = await fetch("https://api.openai.com/v1/models", {
      headers: { authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(15_000),
    });
    return { configured: true, ok: res.ok };
  } catch {
    return { configured: true, ok: false };
  }
}

/** Ping both providers with the freshly-stored keys — powers the admin test button. */
export async function verifyOcrKeys(): Promise<OcrKeysReport> {
  const cfg = await getOcrConfigFresh();
  const [gemini, openai] = await Promise.all([
    pingGemini(cfg.geminiKey),
    pingOpenai(cfg.openaiKey),
  ]);
  return { provider: cfg.provider, gemini, openai };
}
