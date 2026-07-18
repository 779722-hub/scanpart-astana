import { sendTelegramHtml } from "./notify";

export interface TelegramOrderItem {
  brand: string;
  article: string;
  name: string;
  price: number;
  quantity: number;
  /** Склад, где лежит позиция (имя из «Складов» или код Р1/М2/Т3…). */
  warehouse?: string;
}

export interface TelegramOrderMessage {
  chatId: string;
  orderType: "Экспресс" | "Самовывоз";
  clientName: string;
  phone: string;
  whatsapp?: string;
  address?: string;
  pickupAddress?: string;
  pickupHours?: string;
  vehicle?: string;
  vin?: string;
  items: TelegramOrderItem[];
  itemsTotal: number;
  deliveryFee: number;
  totalAmount: number;
  sheetRows?: number[];
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const fmt = (n: number) => new Intl.NumberFormat("ru-RU").format(n);

export async function sendOrderToTelegram(m: TelegramOrderMessage): Promise<boolean> {
  const itemsBlock = m.items
    .map(
      (it, idx) =>
        `${idx + 1}. <b>${escapeHtml(it.name)}</b>\n` +
        `   Бренд: ${escapeHtml(it.brand)} · Парт-номер: <code>${escapeHtml(it.article)}</code>\n` +
        (it.warehouse ? `   🏬 Склад: <b>${escapeHtml(it.warehouse)}</b>\n` : "") +
        `   ${fmt(it.price)} ₸ × ${it.quantity} = <b>${fmt(it.price * it.quantity)} ₸</b>`
    )
    .join("\n");

  const lines: (string | null)[] = [
    `🔔 <b>НОВЫЙ ЗАКАЗ</b> · SCANPART.ASTANA`,
    `Тип: <b>${m.orderType === "Экспресс" ? "Экспресс-доставка" : "Самовывоз"}</b>`,
    ``,
    `👤 <b>${escapeHtml(m.clientName)}</b>`,
    `📞 Телефон: <a href="tel:${encodeURIComponent(m.phone)}">${escapeHtml(m.phone)}</a>`,
    m.whatsapp
      ? `💬 WhatsApp: <a href="https://wa.me/${m.whatsapp.replace(/\D/g, "")}">${escapeHtml(
          m.whatsapp
        )}</a>`
      : null,
    m.orderType === "Экспресс"
      ? `📍 Адрес доставки (Астана): ${m.address ? escapeHtml(m.address) : "<i>не указан</i>"}`
      : `🏬 Самовывоз: ${escapeHtml(m.pickupAddress ?? "г. Астана, пр. Республики, 68")}\n   ⏰ Забрать ${escapeHtml(m.pickupHours ?? "завтра с 14:00 до 18:00")}`,
    m.vehicle
      ? `🚗 Авто: ${escapeHtml(m.vehicle)}${m.vin ? ` · VIN <code>${escapeHtml(m.vin)}</code>` : ""}`
      : m.vin
        ? `🚗 VIN: <code>${escapeHtml(m.vin)}</code>`
        : null,
    ``,
    `🧩 <b>Позиции (${m.items.length}):</b>`,
    itemsBlock,
    ``,
    `Сумма запчастей: <b>${fmt(m.itemsTotal)} ₸</b>`,
    m.orderType === "Экспресс"
      ? `Доставка: <b>${fmt(m.deliveryFee)} ₸</b>`
      : `Самовывоз: <b>бесплатно</b>`,
    `💰 <b>Итого к оплате: ${fmt(m.totalAmount)} ₸</b>`,
    m.sheetRows && m.sheetRows.length
      ? `\n📋 Sheets: ${m.sheetRows.map((r) => `#${r}`).join(", ")}`
      : null,
  ];

  const res = await sendTelegramHtml(lines.filter(Boolean).join("\n"), m.chatId);
  if (!res.ok) console.error("[telegram] send failed:", res.error);
  return res.ok;
}
