import type { Delivery } from "./types";

/**
 * Send the 4-digit handover code to the customer.
 *  - If WhatsApp Cloud API is configured (WHATSAPP_TOKEN + WHATSAPP_PHONE_ID),
 *    the message is sent automatically.
 *  - Otherwise we return a wa.me deep link the courier taps to send it manually.
 * Either way a wa.me fallback link is returned for the courier UI.
 */
export interface HandoverSendResult {
  sent: boolean;
  link: string;
}

function toE164Digits(raw: string): string {
  const d = (raw || "").replace(/\D/g, "");
  // KZ local "8XXXXXXXXXX" → "7XXXXXXXXXX"
  if (d.length === 11 && d.startsWith("8")) return "7" + d.slice(1);
  return d;
}

export function handoverMessage(name: string, code: string): string[] {
  return [
    `Здравствуйте${name ? `, ${name}` : ""}! Ваш заказ SCANPART.ASTANA доставляется.`,
    `Код получения: ${code}`,
    `Назовите этот код курьеру при получении — так мы подтверждаем выдачу именно вам.`,
  ];
}

/** wa.me deep link that opens the customer chat with the code pre-filled. */
export function handoverWaLink(d: Delivery, code: string): string {
  const phone = toE164Digits(d.whatsapp || d.phone);
  const lines = handoverMessage(d.customerName, code);
  return `https://wa.me/${phone}?text=${encodeURIComponent(lines.join("\n"))}`;
}

export async function sendHandoverCode(
  d: Delivery,
  code: string
): Promise<HandoverSendResult> {
  const phone = toE164Digits(d.whatsapp || d.phone);
  const lines = handoverMessage(d.customerName, code);
  const link = handoverWaLink(d, code);

  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  if (token && phoneId && phone) {
    try {
      const res = await fetch(
        `https://graph.facebook.com/v20.0/${phoneId}/messages`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${token}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: phone,
            type: "text",
            text: { body: lines.join("\n") },
          }),
        }
      );
      if (res.ok) return { sent: true, link };
      console.warn("[delivery/notify] whatsapp send failed:", res.status);
    } catch (err) {
      console.warn("[delivery/notify] whatsapp error:", (err as Error).message);
    }
  }
  return { sent: false, link };
}
