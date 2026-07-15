import { getSetting } from "@/lib/sheets/settings";

export type SttProvider = "gemini" | "openai";

// Server fallback order: the selected provider first, then the other one.
const PRIORITY: SttProvider[] = ["openai", "gemini"];

const REQUEST_TIMEOUT_MS = 25_000;

export interface SttConfig {
  enabled: boolean;
  provider: SttProvider | "";
  geminiKey: string;
  openaiKey: string;
}

function keyFor(cfg: SttConfig, provider: SttProvider): string {
  return provider === "gemini" ? cfg.geminiKey : cfg.openaiKey;
}

/** Read voice-search settings. Reuses the same Gemini/OpenAI keys as VIN-OCR. */
export async function getSttConfig(): Promise<SttConfig> {
  const [enabled, provider, geminiKey, openaiKey] = await Promise.all([
    getSetting("voice_search_enabled"),
    getSetting("voice_stt_provider"),
    getSetting("gemini_api_key"),
    getSetting("openai_api_key"),
  ]);
  const p = (provider ?? "").trim().toLowerCase();
  return {
    enabled: (enabled ?? "").trim().toLowerCase() === "on",
    provider: p === "gemini" || p === "openai" ? p : "",
    geminiKey: (geminiKey ?? "").trim(),
    openaiKey: (openaiKey ?? "").trim(),
  };
}

/** Voice search shown at all (browser Web Speech works even without a server key). */
export async function voiceSearchEnabled(): Promise<boolean> {
  const c = await getSttConfig().catch(() => null);
  return Boolean(c?.enabled);
}

/** Server transcription available (a provider is picked AND its key is present). */
export async function sttServerConfigured(): Promise<boolean> {
  const c = await getSttConfig().catch(() => null);
  if (!c || !c.enabled || !c.provider) return false;
  return Boolean(keyFor(c, c.provider));
}

function langHint(locale: string): string {
  return locale === "kk" ? "казахском" : locale === "en" ? "английском" : "русском";
}
function langCode(locale: string): string {
  return locale === "kk" ? "kk" : locale === "en" ? "en" : "ru";
}

function clean(text: string): string {
  return text.trim().replace(/^["'«»]+|["'«».]+$/g, "").replace(/\s+/g, " ").trim();
}

async function callGeminiAudio(
  base64: string,
  mime: string,
  key: string,
  locale: string
): Promise<string> {
  const prompt =
    `Это короткий голосовой поисковый запрос автозапчасти на ${langHint(locale)} языке. ` +
    "Транскрибируй речь дословно и верни ТОЛЬКО текст запроса, без пояснений и знаков препинания.";
  const res = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
    {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [
          { parts: [{ text: prompt }, { inline_data: { mime_type: mime, data: base64 } }] },
        ],
        generationConfig: { temperature: 0, maxOutputTokens: 60 },
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    }
  );
  if (!res.ok) {
    throw new Error(`gemini ${res.status}: ${await res.text().catch(() => "")}`);
  }
  const j = await res.json();
  const parts = j?.candidates?.[0]?.content?.parts ?? [];
  return clean(parts.map((p: { text?: string }) => p.text ?? "").join(""));
}

async function callOpenaiAudio(
  base64: string,
  mime: string,
  key: string,
  locale: string
): Promise<string> {
  const form = new FormData();
  form.append("file", new Blob([Buffer.from(base64, "base64")], { type: mime }), "audio.webm");
  form.append("model", "whisper-1");
  form.append("language", langCode(locale));
  form.append("response_format", "text");
  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { authorization: `Bearer ${key}` },
    body: form,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`openai ${res.status}: ${await res.text().catch(() => "")}`);
  }
  return clean(await res.text());
}

export interface TranscribeResult {
  ok: boolean;
  text?: string;
  provider?: SttProvider;
  error?: "disabled" | "empty" | "provider_error";
}

/**
 * Transcribe a short audio clip. Tries the selected provider first; on error or
 * timeout, falls back to the next provider that has a key — this also rescues
 * codec mismatches (e.g. Gemini rejecting a container OpenAI Whisper accepts).
 */
export async function transcribe(
  base64: string,
  mime: string,
  locale: string
): Promise<TranscribeResult> {
  const cfg = await getSttConfig();
  if (!cfg.enabled || !cfg.provider) return { ok: false, error: "disabled" };

  const order = [cfg.provider, ...PRIORITY.filter((p) => p !== cfg.provider)];
  const attempts = order
    .map((provider) => ({ provider, key: keyFor(cfg, provider) }))
    .filter((a) => a.key);

  if (!attempts.length) return { ok: false, error: "disabled" };

  let lastError: NonNullable<TranscribeResult["error"]> = "provider_error";
  for (const a of attempts) {
    try {
      const text =
        a.provider === "gemini"
          ? await callGeminiAudio(base64, mime, a.key, locale)
          : await callOpenaiAudio(base64, mime, a.key, locale);
      if (text) return { ok: true, text, provider: a.provider };
      lastError = "empty";
    } catch (err) {
      console.error(`[voice/stt] ${a.provider} failed:`, (err as Error).message);
      lastError = "provider_error";
    }
  }
  return { ok: false, error: lastError };
}
