import { Bot } from "grammy";

let _bot: Bot | null = null;

function getBot(): Bot | null {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return null;
  if (_bot) return _bot;
  _bot = new Bot(token);
  return _bot;
}

export interface TelegramOrderItem {
  brand: string;
  article: string;
  name: string;
  price: number;
  quantity: number;
}

export interface TelegramOrderMessage {
  chatId: string;
  orderType: "Экспресс" | "Самовывоз";
  clientName: string;
  phone: string;
  whatsapp?: string;
  address?: string;
  vehicle?: string;
  vin?: string;
  items: TelegramOrderItem[];
  totalAmount: number;
  sheetRows?: number[];
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const fmt = (n: number) => new Intl.NumberFormat("ru-RU").format(n);

export async function sendOrderToTelegram(m: TelegramOrderMessage): Promise<boolean> {
  const bot = getBot();
  if (!bot || !m.chatId) return false;

  const itemsBlock = m.items
    .map(
      (it, idx) =>
        `${idx + 1}. <b>${escapeHtml(it.name)}</b>\n` +
        `   Бренд: ${escapeHtml(it.brand)} · Парт-номер: <code>${escapeHtml(it.article)}</code>\n` +
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
      : `🏬 Самовывоз: г. Астана, пр. Республики, 68`,
    m.vehicle
      ? `🚗 Авто: ${escapeHtml(m.vehicle)}${m.vin ? ` · VIN <code>${escapeHtml(m.vin)}</code>` : ""}`
      : m.vin
        ? `🚗 VIN: <code>${escapeHtml(m.vin)}</code>`
        : null,
    ``,
    `🧩 <b>Позиции (${m.items.length}):</b>`,
    itemsBlock,
    ``,
    `💰 <b>Итого к оплате: ${fmt(m.totalAmount)} ₸</b>`,
    m.sheetRows && m.sheetRows.length
      ? `\n📋 Sheets: ${m.sheetRows.map((r) => `#${r}`).join(", ")}`
      : null,
  ];

  try {
    await bot.api.sendMessage(m.chatId, lines.filter(Boolean).join("\n"), {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
    });
    return true;
  } catch (err) {
    console.error("[telegram] send failed", (err as Error).message);
    return false;
  }
}
