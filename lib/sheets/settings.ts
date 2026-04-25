import { MARKUP_DEFAULT, clampMarkup } from "@/lib/markup";
import { readSetting, writeSetting } from "./client";

const CACHE_TTL_MS = 60_000;
let cache: { at: number; map: Record<string, string> } | null = null;

async function readAll(): Promise<Record<string, string>> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.map;
  const map = await readSetting();
  cache = { at: Date.now(), map };
  return map;
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
  cache = null;
  return clamped;
}

export interface PublicSettings {
  markupPercent: number;
  expressDeliveryPrice: number;
  expressHours: string;
  pickupAddress: string;
  pickupHours: string;
  managerPhoneDisplay: string;
  managerWhatsappE164: string;
  telegramChatId: string;
}

export async function getAllSettings(): Promise<PublicSettings> {
  const map = await readAll().catch(() => ({} as Record<string, string>));
  return {
    markupPercent: clampMarkup(Number(map.markup_percent ?? MARKUP_DEFAULT)),
    expressDeliveryPrice: Number(map.express_delivery_price ?? 3000),
    expressHours: map.express_hours ?? "Пн-Сб 09:00–16:30",
    pickupAddress: map.pickup_address ?? "г. Астана, пр. Республики, 68",
    pickupHours: map.pickup_hours ?? "завтра 14:00–18:00",
    managerPhoneDisplay: map.manager_phone_display ?? "",
    managerWhatsappE164: map.manager_whatsapp_e164 ?? "",
    telegramChatId: map.telegram_chat_id ?? "",
  };
}
