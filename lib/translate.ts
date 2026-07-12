import { google } from "googleapis";

/**
 * Google Cloud Translation (v2) using the SAME service account as Sheets.
 * Requires, one-time in Google Cloud: enable "Cloud Translation API", enable
 * billing, and grant the service account the "Cloud Translation API User" role.
 */
const SCOPE = "https://www.googleapis.com/auth/cloud-translation";

let _client: InstanceType<typeof google.auth.JWT> | null = null;

function client() {
  if (_client) return _client;
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64;
  if (!raw) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 is not set");
  const creds = JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
  _client = new google.auth.JWT(creds.client_email, undefined, creds.private_key, [SCOPE]);
  return _client;
}

export function translationConfigured(): boolean {
  return Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64);
}

function unescapeHtml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

export async function translateText(
  text: string,
  target: "kk" | "en",
  source = "ru"
): Promise<string> {
  const q = text.trim();
  if (!q) return "";
  const token = (await client().getAccessToken()).token;
  if (!token) throw new Error("no_access_token");
  const res = await fetch(
    "https://translation.googleapis.com/language/translate/v2",
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ q, target, source, format: "text" }),
    }
  );
  if (!res.ok) {
    throw new Error(`translate_${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const json = (await res.json()) as {
    data?: { translations?: Array<{ translatedText?: string }> };
  };
  return unescapeHtml(json.data?.translations?.[0]?.translatedText ?? "");
}

/** Translate a Russian source string into Kazakh and English. */
export async function translateRuToKkEn(
  ru: string
): Promise<{ kk: string; en: string }> {
  const kk = await translateText(ru, "kk");
  const en = await translateText(ru, "en");
  return { kk, en };
}
