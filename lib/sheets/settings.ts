import { unstable_cache, revalidateTag } from "next/cache";
import { MARKUP_DEFAULT, clampMarkup } from "@/lib/markup";
import { readSetting, writeSetting, readWarehouses } from "./client";

const CACHE_TTL_MS = 60_000;

/** Tag-revalidated on admin write, like CONTENT_TAG/THEME_TAG in lib/content. */
export const SETTINGS_TAG = "settings";

// Per-warehouse markup overrides, keyed by supplier code (Р1/М2/Т3…). Cached
// like settings; warehouses without an explicit markup are absent (use global).
let whMarkupCache: { at: number; map: Record<string, number> } | null = null;
export async function getWarehouseMarkupMap(): Promise<Record<string, number>> {
  if (whMarkupCache && Date.now() - whMarkupCache.at < CACHE_TTL_MS) {
    return whMarkupCache.map;
  }
  const map: Record<string, number> = {};
  try {
    for (const w of await readWarehouses()) {
      if (w.sourceCode && w.markup != null) map[w.sourceCode] = w.markup;
    }
  } catch {
    /* keep empty → global markup applies everywhere */
  }
  whMarkupCache = { at: Date.now(), map };
  return map;
}

// Cached in the Next data cache (not a module variable) so that statically
// rendered pages — home, /info — are rebuilt when the admin saves a setting.
const readAll = unstable_cache(
  async (): Promise<Record<string, string>> => readSetting(),
  ["sheets-settings"],
  { tags: [SETTINGS_TAG], revalidate: 60 }
);

/** Drop the settings cache — call after any admin write. */
export function invalidateSettings(): void {
  revalidateTag(SETTINGS_TAG);
}

export async function getSetting(key: string): Promise<string | undefined> {
  const all = await readAll();
  return all[key];
}

export async function getMarkupPercent(): Promise<number> {
  try {
    const v = await getSetting("markup_percent");
    const n = v ? Number(v) : NaN;
    return clampMarkup(n);
  } catch {
    return MARKUP_DEFAULT;
  }
}

export async function setMarkupPercent(pct: number): Promise<number> {
  const clamped = clampMarkup(pct);
  await writeSetting("markup_percent", String(clamped));
  invalidateSettings();
  return clamped;
}

export const ANALOGS_MIN = 0;
export const ANALOGS_MAX = 10;
export const ANALOGS_DEFAULT = 3;

function clampAnalogs(n: number): number {
  if (!Number.isFinite(n)) return ANALOGS_DEFAULT;
  return Math.max(ANALOGS_MIN, Math.min(ANALOGS_MAX, Math.floor(n)));
}

export async function getAnalogsMax(): Promise<number> {
  try {
    const v = await getSetting("analogs_max");
    return clampAnalogs(Number(v));
  } catch {
    return ANALOGS_DEFAULT;
  }
}

export interface PublicSettings {
  markupPercent: number;
  analogsMax: number;
  expressDeliveryPrice: number;
  expressHours: string;
  pickupAddress: string;
  pickupHours: string;
  managerPhoneDisplay: string;
  managerWhatsappE164: string;
  telegramChatId: string;
  googleSiteVerification: string;
  yandexVerification: string;
}

export async function getAllSettings(): Promise<PublicSettings> {
  const map = await readAll().catch(() => ({} as Record<string, string>));
  return {
    markupPercent: clampMarkup(Number(map.markup_percent ?? MARKUP_DEFAULT)),
    analogsMax: clampAnalogs(Number(map.analogs_max ?? ANALOGS_DEFAULT)),
    expressDeliveryPrice: Number(map.express_delivery_price ?? 4000),
    expressHours: map.express_hours ?? "Пн-Сб 09:00–16:00",
    pickupAddress: map.pickup_address ?? "г. Астана, пр. Республики, 68",
    pickupHours: map.pickup_hours ?? "завтра 14:00–18:00",
    managerPhoneDisplay: map.manager_phone_display ?? "",
    managerWhatsappE164: map.manager_whatsapp_e164 ?? "",
    telegramChatId: map.telegram_chat_id ?? "",
    // Коды подтверждения владения сайтом. Держим в админке, а не в env: их
    // вставляют один раз, и ради этого не должно требоваться выкатывать код.
    googleSiteVerification: map.google_site_verification ?? "",
    yandexVerification: map.yandex_verification ?? "",
  };
}
