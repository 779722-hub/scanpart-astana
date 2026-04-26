import { NextRequest, NextResponse } from "next/server";
import { orderSchema, normalizePhoneE164, formatPhonePretty } from "@/lib/schemas";
import { appendOrder } from "@/lib/sheets/client";
import { getAllSettings } from "@/lib/sheets/settings";
import { sendOrderToTelegram } from "@/lib/telegram/bot";
import { buildOrderWhatsAppMessage, buildWhatsAppLink } from "@/lib/whatsapp";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = orderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "validation", issues: parsed.error.issues },
      { status: 400 }
    );
  }
  const d = parsed.data;

  const session = await getSession();
  const vehicle = session.vehicle
    ? `${session.vehicle.make} ${session.vehicle.model} ${session.vehicle.year}`.trim()
    : "";
  const vin = session.vin ?? "";

  const orderType = d.kind === "express" ? "Экспресс" : "Самовывоз";
  const settings = await getAllSettings().catch(() => null);
  const isoNow = new Date().toISOString();

  // 1. Append one row per cart item to Google Sheets.
  const sheetRows: Array<number | null> = [];
  for (const item of d.items) {
    try {
      const row = await appendOrder({
        date: isoNow,
        telegramId: "",
        clientName: d.name,
        vin,
        vehicle,
        partName: item.partName,
        partArticle: item.article,
        brand: item.brand,
        price: item.price,
        quantity: item.quantity,
        orderType,
        address: d.address ?? "",
        phone: d.phone,
        whatsapp: d.whatsapp ?? "",
        status: "Новый",
      });
      sheetRows.push(row);
    } catch (err) {
      console.error("[api/order] sheets append failed", (err as Error).message);
      sheetRows.push(null);
    }
  }

  const itemsTotal = d.items.reduce((s, i) => s + i.price * i.quantity, 0);
  const deliveryFee =
    d.kind === "express" ? settings?.expressDeliveryPrice ?? 4000 : 0;
  const grandTotal = itemsTotal + deliveryFee;
  const pickupAddress = settings?.pickupAddress ?? "г. Астана, пр. Республики, 68";
  const pickupHours = settings?.pickupHours ?? "завтра с 14:00 до 18:00";

  // 2. Notify manager in Telegram (single message with full breakdown).
  if (settings?.telegramChatId) {
    await sendOrderToTelegram({
      chatId: settings.telegramChatId,
      orderType,
      clientName: d.name,
      phone: d.phone,
      whatsapp: d.whatsapp || undefined,
      address: d.address || undefined,
      pickupAddress,
      pickupHours,
      vehicle: vehicle || undefined,
      vin: vin || undefined,
      items: d.items.map((i) => ({
        brand: i.brand,
        article: i.article,
        name: i.partName,
        price: i.price,
        quantity: i.quantity,
      })),
      itemsTotal,
      deliveryFee,
      totalAmount: grandTotal,
      sheetRows: sheetRows.filter((r): r is number => r !== null),
    });
  }

  // 3. WhatsApp deep-link for the client.
  let whatsappUrl: string | null = null;
  if (settings?.managerWhatsappE164) {
    const lines = buildOrderWhatsAppMessage({
      orderType: d.kind,
      clientName: d.name,
      phone: formatPhonePretty(d.phone),
      whatsapp: d.whatsapp ? formatPhonePretty(d.whatsapp) : undefined,
      address: d.address || undefined,
      pickupAddress,
      pickupHours,
      items: d.items.map((i) => ({
        brand: i.brand,
        article: i.article,
        name: i.partName,
        price: i.price,
        quantity: i.quantity,
      })),
      itemsTotal,
      deliveryFee,
      totalAmount: grandTotal,
      vehicle: vehicle || undefined,
      vin: vin || undefined,
    });
    whatsappUrl = buildWhatsAppLink({
      managerE164: settings.managerWhatsappE164,
      lines,
    });
  }

  return NextResponse.json({
    ok: true,
    sheetRows,
    whatsappUrl,
    orderType: d.kind,
    itemsTotal,
    deliveryFee,
    total: grandTotal,
  });
}

// Suppress unused-import warning when bundler tree-shakes alternate paths.
void normalizePhoneE164;
