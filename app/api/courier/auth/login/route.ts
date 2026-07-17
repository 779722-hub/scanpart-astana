import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/session";
import { loginCourier } from "@/lib/auth/couriers";
import { consume } from "@/lib/auth/rate-limit";

export const runtime = "nodejs";

const schema = z.object({ login: z.string().min(1), password: z.string().min(1) });

function ipFromHeaders(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

export async function POST(req: NextRequest) {
  // Защита от перебора пароля: страница /courier открыта по адресу (иначе
  // курьеру некуда войти), поэтому логин обязан быть под лимитом, как у
  // админа и клиента. Раньше его тут не было — можно было молотить пароли.
  const ip = ipFromHeaders(req);
  const rl = consume(`courier-login:${ip}`, 5, 1000 * 60 * 10);
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: "rate_limited", retryAfter: rl.retryAfter },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  }
  const courier = await loginCourier(parsed.data.login, parsed.data.password);
  if (!courier) {
    return NextResponse.json({ ok: false, error: "bad_credentials" }, { status: 401 });
  }
  const session = await getSession();
  session.courier = {
    id: courier.id,
    name: courier.name,
    phone: courier.phone,
    loggedInAt: new Date().toISOString(),
  };
  await session.save();
  return NextResponse.json({
    ok: true,
    courier: { id: courier.id, name: courier.name, phone: courier.phone },
  });
}
