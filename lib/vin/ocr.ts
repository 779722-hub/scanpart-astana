import { readSetting } from "@/lib/sheets/client";
import { getSetting } from "@/lib/sheets/settings";
import { isVinFormatValid, normalizeVin } from "./validator";

export type OcrProvider = "gemini" | "openai" | "openrouter";

// Fallback order: the selected provider goes first, the rest follow in this
// priority (OpenRouter is a slower gateway, so it comes last).
const PRIORITY: OcrProvider[] = ["gemini", "openai", "openrouter"];

const DEFAULT_OPENROUTER_MODEL = "google/gemini-2.0-flash-exp:free";

export interface OcrConfig {
  provider: OcrProvider | "";
  geminiKey: string;
  openaiKey: string;
  openrouterKey: string;
  openrouterModel: string;
}

const REQUEST_TIMEOUT_MS = 25_000;

function parseConfig(map: Record<string, string | undefined>): OcrConfig {
  const p = (map.vin_ocr_provider ?? "").trim().toLowerCase();
  return {
    provider: p === "gemini" || p === "openai" || p === "openrouter" ? p : "",
    geminiKey: (map.gemini_api_key ?? "").trim(),
    openaiKey: (map.openai_api_key ?? "").trim(),
    openrouterKey: (map.openrouter_api_key ?? "").trim(),
    openrouterModel: (map.openrouter_model ?? "").trim() || DEFAULT_OPENROUTER_MODEL,
  };
}

function keyFor(cfg: OcrConfig, provider: OcrProvider): string {
  return provider === "gemini"
    ? cfg.geminiKey
    : provider === "openai"
      ? cfg.openaiKey
      : cfg.openrouterKey;
}

/** Read the VIN-OCR settings (provider + API keys). Cached (~60s) via getSetting. */
export async function getOcrConfig(): Promise<OcrConfig> {
  const [provider, geminiKey, openaiKey, openrouterKey, openrouterModel] =
    await Promise.all([
      getSetting("vin_ocr_provider"),
      getSetting("gemini_api_key"),
      getSetting("openai_api_key"),
      getSetting("openrouter_api_key"),
      getSetting("openrouter_model"),
    ]);
  return parseConfig({
    vin_ocr_provider: provider,
    gemini_api_key: geminiKey,
    openai_api_key: openaiKey,
    openrouter_api_key: openrouterKey,
    openrouter_model: openrouterModel,
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
  return Boolean(keyFor(c, c.provider));
}

const PROMPT =
  "На изображении — свидетельство о регистрации транспортного средства (техпаспорт), " +
  "возможно казахстанское, где поля пронумерованы. Фото могло быть снято обычным телефоном: " +
  "оно может быть тёмным, с бликами и засветкой, с тенями, под наклоном или слегка размытым — " +
  "внимательно вглядись в текст и всё равно постарайся его прочитать. " +
  "ВАЖНО ПРО ОРИЕНТАЦИЮ: фото может быть повёрнуто — снято вертикально, положено боком " +
  "(повёрнуто на 90° влево или вправо), под большим углом или вовсе вверх ногами (на 180°). " +
  "Мысленно поверни изображение во все стороны, найди правильное положение и внимательно читай " +
  "текст при ЛЮБОЙ ориентации. Не сдавайся из-за поворота — VIN там есть, даже если строки идут " +
  "вертикально или перевёрнуты. " +
  "Найди VIN — идентификационный номер, ровно 17 символов из латинских букв и цифр " +
  "(буквы I, O, Q в VIN не встречаются). " +
  "На казахстанских свидетельствах VIN обычно указан в поле под номером 5 (VIN / номер кузова). " +
  "Не путай его с номером двигателя, номером шасси, госномером или номером самого свидетельства. " +
  "Читай посимвольно и различай похожие знаки: 0 и O, 1 и I, 8 и B, 5 и S, 2 и Z, 6 и G. " +
  "Верни ТОЛЬКО 17 символов VIN одной строкой, без пробелов и пояснений. " +
  "Если VIN разобрать невозможно — верни NONE.";

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
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
    {
      method: "POST",
      // Auth via header (works for both AIza… and the newer AQ.… key format).
      headers: { "content-type": "application/json", "x-goog-api-key": key },
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

/** OpenAI-compatible chat call — shared by OpenAI and OpenRouter (same schema). */
async function callOpenaiCompatible(
  url: string,
  key: string,
  model: string,
  base64: string,
  mime: string,
  extraHeaders: Record<string, string> = {}
): Promise<string> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}`, ...extraHeaders },
    body: JSON.stringify({
      model,
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
    throw new Error(`${url} ${res.status}: ${await res.text().catch(() => "")}`);
  }
  const j = await res.json();
  return j?.choices?.[0]?.message?.content ?? "";
}

async function callProvider(
  provider: OcrProvider,
  base64: string,
  mime: string,
  cfg: OcrConfig
): Promise<string> {
  if (provider === "gemini") return callGemini(base64, mime, cfg.geminiKey);
  if (provider === "openai") {
    return callOpenaiCompatible(
      "https://api.openai.com/v1/chat/completions",
      cfg.openaiKey,
      "gpt-4o-mini",
      base64,
      mime
    );
  }
  return callOpenaiCompatible(
    "https://openrouter.ai/api/v1/chat/completions",
    cfg.openrouterKey,
    cfg.openrouterModel,
    base64,
    mime,
    { "X-Title": "SCANPART" }
  );
}

export interface RecognizeResult {
  ok: boolean;
  vin?: string;
  provider?: OcrProvider;
  error?: "disabled" | "no_vin" | "provider_error";
}

/**
 * Recognize a VIN from an image. Tries the selected provider first; if it errors
 * or times out, automatically falls back to the next provider that has a key
 * (Gemini → OpenAI → OpenRouter). A successful reply with no VIN does NOT fall
 * back — that's an image problem, not a provider outage.
 */
export async function recognizeVin(base64: string, mime: string): Promise<RecognizeResult> {
  const cfg = await getOcrConfig();
  if (!cfg.provider) return { ok: false, error: "disabled" };

  const order = [cfg.provider, ...PRIORITY.filter((p) => p !== cfg.provider)];
  const attempts = order
    .map((provider) => ({ provider, key: keyFor(cfg, provider) }))
    .filter((a) => a.key);

  if (!attempts.length) return { ok: false, error: "disabled" };

  let lastError: NonNullable<RecognizeResult["error"]> = "provider_error";
  for (const a of attempts) {
    try {
      const text = await callProvider(a.provider, base64, mime, cfg);
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
  openrouter: KeyStatus;
}

async function pingUrl(url: string, headers: Record<string, string>): Promise<boolean> {
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function pingKey(
  key: string,
  url: string,
  headers: Record<string, string>
): Promise<KeyStatus> {
  if (!key) return { configured: false, ok: false };
  return { configured: true, ok: await pingUrl(url, headers) };
}

/** Ping every provider with the freshly-stored keys — powers the admin test button. */
export async function verifyOcrKeys(): Promise<OcrKeysReport> {
  const cfg = await getOcrConfigFresh();
  const [gemini, openai, openrouter] = await Promise.all([
    pingKey(cfg.geminiKey, "https://generativelanguage.googleapis.com/v1beta/models", {
      "x-goog-api-key": cfg.geminiKey,
    }),
    pingKey(cfg.openaiKey, "https://api.openai.com/v1/models", {
      authorization: `Bearer ${cfg.openaiKey}`,
    }),
    pingKey(cfg.openrouterKey, "https://openrouter.ai/api/v1/auth/key", {
      authorization: `Bearer ${cfg.openrouterKey}`,
    }),
  ]);
  return { provider: cfg.provider, gemini, openai, openrouter };
}
