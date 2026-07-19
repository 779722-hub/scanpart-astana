import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getSetting } from "@/lib/sheets/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session.courier) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  // Настройки метки курьера — те же, что на карте владельца, чтобы обозначение
  // курьера выглядело одинаково в админке и в приложении курьера.
  const [courierColor, courierShape] = await Promise.all([
    getSetting("courier_color"),
    getSetting("courier_shape"),
  ]);
  return NextResponse.json({
    ok: true,
    courier: session.courier,
    markers: {
      courierColor: courierColor || "#E10600",
      courierShape: courierShape || "circle",
    },
  });
}
