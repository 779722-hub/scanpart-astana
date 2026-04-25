import { NextRequest, NextResponse } from "next/server";
import { orderSchema, normalizePhoneE164 } from "@/lib/schemas";
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

  // 1. Append to Google Sheets
  let sheetRow: number | null = null;
  try {
    sheetRow = await appendOrder({
      date: new Date().toISOString(),
      telegramId: "", // reserved — if the flow later migrates into a TG WebApp
      clientName: d.name,
      vin,
      vehicle,
      partName: d.partName,
      partArticle: d.article,
      brand: d.brand,
      price: d.price,
      quantity: d.quantity,
      orderType,
      address: d.address ?? "",
      phone: d.phone,
      whatsapp: d.whatsapp ?? "",
      status: "Новый",
    });
  } catch (err) {
    console.error("[api/order] sheets append failed", (err as Error).message);
  }

  // 2. Notify manager in Telegram
  if (settings?.telegramChatId) {
    await sendOrderToTelegram({
      chatId: settings.telegramChatId,
      orderType,
      clientName: d.name,
      phone: d.phone,
      whatsapp: d.whatsapp || undefined,
      address: d.address || undefined,
      vehicle: vehicle || undefined,
      vin: vin || undefined,
      partName: d.partName,
      partBrand: d.brand,
      partArticle: d.article,
      price: d.price,
      quantity: d.quantity,
      sheetRow,
    });
  }

  // 3. Build WhatsApp deep-link for the client to open
  let whatsappUrl: string | null = null;
  if (settings?.managerWhatsappE164) {
    const lines = buildOrderWhatsAppMessage({
      orderType: d.kind,
      clientName: d.name,
      phone: normalizePhoneE164(d.phone),
      address: d.address || undefined,
      partName: d.partName,
      partBrand: d.brand,
      partArticle: d.article,
      price: d.price,
      quantity: d.quantity,
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
    sheetRow,
    whatsappUrl,
    orderType: d.kind,
  });
}
