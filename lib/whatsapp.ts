/**
 * Build a wa.me deep-link pointing at the manager's WhatsApp number with a
 * pre-filled message. `managerE164` must be a phone in E.164 format without "+".
 * Example: "77000000000" (Kazakhstan mobile).
 */
export function buildWhatsAppLink(args: {
  managerE164: string;
  lines: string[];
}): string {
  const text = encodeURIComponent(args.lines.join("\n"));
  const phone = args.managerE164.replace(/\D/g, "");
  return `https://wa.me/${phone}?text=${text}`;
}

export interface WhatsAppOrderItem {
  brand: string;
  article: string;
  name: string;
  price: number;
  quantity: number;
}

export function buildOrderWhatsAppMessage(args: {
  orderType: "express" | "pickup";
  clientName: string;
  phone: string;
  whatsapp?: string;
  address?: string;
  pickupAddress?: string;
  pickupHours?: string;
  items: WhatsAppOrderItem[];
  itemsTotal: number;
  deliveryFee: number;
  totalAmount: number;
  vehicle?: string;
  vin?: string;
}): string[] {
  const t = args.orderType === "express" ? "Экспресс-доставка" : "Самовывоз";
  const fmt = (n: number) => new Intl.NumberFormat("ru-RU").format(n);

  const lines: string[] = [
    `Здравствуйте! Я оформил заказ на SCANPART.ASTANA.`,
    `Тип: ${t}`,
    ``,
    `Клиент: ${args.clientName}`,
    `Телефон: ${args.phone}`,
  ];
  if (args.whatsapp) lines.push(`WhatsApp: ${args.whatsapp}`);
  if (args.orderType === "express") {
    lines.push(`Адрес доставки (Астана): ${args.address || "—"}`);
  } else {
    lines.push(`Самовывоз: ${args.pickupAddress ?? "г. Астана, пр. Республики, 68"}`);
    lines.push(`Забрать ${args.pickupHours ?? "завтра с 14:00 до 18:00"}`);
  }
  if (args.vehicle) {
    lines.push(`Авто: ${args.vehicle}${args.vin ? ` (VIN ${args.vin})` : ""}`);
  } else if (args.vin) {
    lines.push(`VIN: ${args.vin}`);
  }
  lines.push("");
  lines.push(`Позиции (${args.items.length}):`);
  args.items.forEach((it, i) => {
    lines.push(
      `${i + 1}. ${it.name} — ${it.brand} ${it.article} · ${fmt(it.price)} ₸ × ${it.quantity} = ${fmt(it.price * it.quantity)} ₸`
    );
  });
  lines.push("");
  lines.push(`Сумма запчастей: ${fmt(args.itemsTotal)} ₸`);
  if (args.orderType === "express") {
    lines.push(`Доставка: ${fmt(args.deliveryFee)} ₸`);
  } else {
    lines.push(`Самовывоз: бесплатно`);
  }
  lines.push(`Итого: ${fmt(args.totalAmount)} ₸`);
  return lines;
}
