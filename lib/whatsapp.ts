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

export function buildOrderWhatsAppMessage(args: {
  orderType: "express" | "pickup";
  clientName: string;
  phone: string;
  address?: string;
  partName: string;
  partBrand: string;
  partArticle: string;
  price: number;
  quantity: number;
  vehicle?: string;
  vin?: string;
}): string[] {
  const t = args.orderType === "express" ? "Экспресс-доставка" : "Самовывоз";
  const fmt = (n: number) => new Intl.NumberFormat("ru-RU").format(n);
  const total = args.price * args.quantity;
  return [
    `Здравствуйте! Я оформил заказ на SCANPART.ASTANA.`,
    `Тип: ${t}`,
    `Запчасть: ${args.partName} (${args.partBrand} ${args.partArticle})`,
    `Цена за шт.: ${fmt(args.price)} ₸ · Кол-во: ${args.quantity}`,
    `Итого: ${fmt(total)} ₸`,
    args.vehicle
      ? `Авто: ${args.vehicle}${args.vin ? ` (VIN ${args.vin})` : ""}`
      : "",
    `Имя: ${args.clientName}, тел: ${args.phone}`,
    args.address ? `Адрес: ${args.address}` : "",
  ].filter(Boolean);
}
