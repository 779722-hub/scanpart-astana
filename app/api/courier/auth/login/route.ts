import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/session";
import { loginCourier } from "@/lib/auth/couriers";

export const runtime = "nodejs";

const schema = z.object({ login: z.string().min(1), password: z.string().min(1) });

export async function POST(req: NextRequest) {
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
