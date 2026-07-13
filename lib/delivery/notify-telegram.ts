import { sendTelegramHtml } from "@/lib/telegram/notify";
import type { Delivery } from "@/lib/delivery/types";

/**
 * Owner-facing Telegram notifications for delivery events. Fire-and-forget:
 * sendTelegramHtml no-ops when the bot token / chat id aren't configured, so
 * callers can ignore the result. These go to the manager chat — warehouse and
 * courier details are fine here (never customer-facing).
 */
export type DeliveryEvent = "created" | "assigned" | "en_route" | "delivered";

const HEAD: Record<DeliveryEvent, string> = {
  created: "🆕 Новая доставка",
  assigned: "📦 Доставка назначена курьеру",
  en_route: "🚗 Курьер выехал к клиенту",
  delivered: "✅ Доставка вручена",
};

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function notifyDelivery(
  event: DeliveryEvent,
  d: Delivery,
  opts: { courierName?: string } = {}
): Promise<void> {
  const lines = [`<b>${HEAD[event]}</b>`];
  if (opts.courierName) lines.push(`Курьер: <b>${esc(opts.courierName)}</b>`);
  if (d.customerName) lines.push(`Клиент: ${esc(d.customerName)}`);
  if (d.phone) lines.push(`Телефон: ${esc(d.phone)}`);
  if (d.items) lines.push(`Товар: ${esc(d.items)}`);
  if (d.address) lines.push(`Адрес: ${esc(d.address)}`);
  await sendTelegramHtml(lines.join("\n")).catch(() => {});
}
