import { NextRequest, NextResponse } from "next/server";
import { orderSchema, normalizePhoneE164, formatPhonePretty } from "@/lib/schemas";
import { appendOrder } from "@/lib/sheets/client";
import { getAllSettings, getWarehouseNameMap } from "@/lib/sheets/settings";
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
  // Код склада → читаемое имя из «Складов», чтобы менеджер в заказе видел склад.
  const whNames = await getWarehouseNameMap().catch(() => ({}) as Record<string, string>);
  // Склад лежит на позиции; имя — из карты, иначе сам код. Источник скрыт от
  // клиента, поэтому склад идёт ТОЛЬКО в телеграм менеджеру, не в WhatsApp клиента.
  const warehouseOf = (code?: string) =>
    code ? whNames[code] || code : undefined;
  const isoNow = new Date().toISOString();

  // 1. Append one row per cart item to Google Sheets.
  // We re-use the `Telegram ID` column to store the customer email so the
  // /account history page can filter by it.
  const customerLink = session.customer?.email ?? "";
  const sheetRows: Array<number | null> = [];
  for (const item of d.items) {
    try {
      const row = await appendOrder({
        date: isoNow,
        telegramId: customerLink,
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
        source: item.sourceCode ?? "",
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
  let telegramSent = false;
  if (settings?.telegramChatId) {
    telegramSent = await sendOrderToTelegram({
      chatId: settings.telegramChatId,
      orderType,
      clientName: d.name,
      phone: normalizePhoneE164(d.phone) || d.phone,
      whatsapp: d.whatsapp
        ? normalizePhoneE164(d.whatsapp) || d.whatsapp
        : undefined,
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
        warehouse: warehouseOf(i.sourceCode),
      })),
      itemsTotal,
      deliveryFee,
      totalAmount: grandTotal,
      sheetRows: sheetRows.filter((r): r is number => r !== null),
    }).catch((err) => {
      console.error("[api/order] telegram send failed", (err as Error).message);
      return false;
    });
    if (!telegramSent) {
      console.warn("[api/order] telegram configured but message was not sent");
    }
  } else {
    console.warn(
      "[api/order] telegram not configured (telegram_chat_id missing) — manager not notified"
    );
  }

  // Never acknowledge an order we failed to persist anywhere. If every Sheets
  // append failed AND Telegram didn't deliver, tell the client it didn't go
  // through so they can retry (instead of a false "Заказ принят").
  const anySheetSaved = sheetRows.some((r) => r !== null);
  if (!anySheetSaved && !telegramSent) {
    console.error("[api/order] order NOT persisted (sheets failed + telegram off)");
    return NextResponse.json(
      { ok: false, error: "not_saved" },
      { status: 502 }
    );
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
