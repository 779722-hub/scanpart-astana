import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/guards";
import { listOrders, appendOrder } from "@/lib/sheets/client";

export const runtime = "nodejs";

export async function GET() {
  const guard = await requireAuth();
  if (guard instanceof NextResponse) return guard;
  try {
    const orders = await listOrders(200);
    return NextResponse.json({ ok: true, orders });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 503 }
    );
  }
}

// Добавить позицию в существующий заказ. Реквизиты заказа (дата, телефон,
// клиент, авто, тип/адрес, статус) копируются на сервере из строки `fromRow`,
// чтобы новая позиция гарантированно попала в ту же группу (ключ — дата+телефон).
const addSchema = z.object({
  fromRow: z.number().int().min(2),
  item: z.object({
    partName: z.string().trim().min(1).max(300),
    brand: z.string().trim().max(100).optional().default(""),
    partArticle: z.string().trim().max(100).optional().default(""),
    price: z.number().min(0).max(100_000_000),
    quantity: z.number().int().min(1).max(999),
    source: z.string().trim().max(10).optional().default(""),
  }),
});

export async function POST(req: NextRequest) {
  const guard = await requireAuth();
  if (guard instanceof NextResponse) return guard;
  const parsed = addSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  }
  const { fromRow, item } = parsed.data;
  const orders = await listOrders(200);
  const base = orders.find((o) => o.rowNumber === fromRow);
  if (!base) {
    return NextResponse.json({ ok: false, error: "order_not_found" }, { status: 404 });
  }
  const rowNumber = await appendOrder({
    date: base.date,
    telegramId: base.telegramId,
    clientName: base.clientName,
    vin: base.vin,
    vehicle: base.vehicle,
    partName: item.partName,
    partArticle: item.partArticle,
    brand: item.brand,
    price: item.price,
    quantity: item.quantity,
    orderType: base.orderType,
    address: base.address,
    phone: base.phone,
    whatsapp: base.whatsapp,
    status: base.status,
    source: item.source,
  });
  return NextResponse.json({ ok: true, rowNumber });
}
