import { Bot } from "grammy";

let _bot: Bot | null = null;

function getBot(): Bot | null {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return null;
  if (_bot) return _bot;
  _bot = new Bot(token);
  return _bot;
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
  partName: string;
  partBrand: string;
  partArticle: string;
  price: number;
  quantity: number;
  sheetRow?: number | null;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export async function sendOrderToTelegram(m: TelegramOrderMessage): Promise<boolean> {
  const bot = getBot();
  if (!bot || !m.chatId) return false;
  const lines = [
    `🔔 <b>НОВЫЙ ЗАКАЗ</b> · SCANPART.ASTANA`,
    `Тип: <b>${m.orderType === "Экспресс" ? "Экспресс-доставка" : "Самовывоз"}</b>`,
    ``,
    `👤 <b>${escapeHtml(m.clientName)}</b>`,
    `📞 <a href="tel:${encodeURIComponent(m.phone)}">${escapeHtml(m.phone)}</a>`,
    m.whatsapp ? `💬 WhatsApp: ${escapeHtml(m.whatsapp)}` : null,
    m.address ? `📍 ${escapeHtml(m.address)}` : null,
    m.vehicle ? `🚗 ${escapeHtml(m.vehicle)}${m.vin ? ` · VIN <code>${escapeHtml(m.vin)}</code>` : ""}` : null,
    ``,
    `🧩 <b>${escapeHtml(m.partName)}</b>`,
    `Бренд: <b>${escapeHtml(m.partBrand)}</b> · Парт-номер: <code>${escapeHtml(m.partArticle)}</code>`,
    `Цена клиенту: <b>${new Intl.NumberFormat("ru-RU").format(m.price)} ₸</b> · Кол-во: ${m.quantity}`,
    m.sheetRow ? `\n📋 Строка #${m.sheetRow} в Google Sheets` : null,
  ].filter(Boolean);

  try {
    await bot.api.sendMessage(m.chatId, lines.join("\n"), {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
    });
    return true;
  } catch (err) {
    console.error("[telegram] send failed", (err as Error).message);
    return false;
  }
}
