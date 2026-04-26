import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getCustomerForLogin,
  verifyCustomerPassword,
} from "@/lib/auth/customers";
import { getSession } from "@/lib/session";
import { consume } from "@/lib/auth/rate-limit";

export const runtime = "nodejs";

const schema = z.object({
  email: z.string().email().max(120),
  password: z.string().min(1).max(200),
});

function ipFromHeaders(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

export async function POST(req: NextRequest) {
  const ip = ipFromHeaders(req);
  const rl = consume(`customer-login:${ip}`, 8, 1000 * 60 * 10);
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: "rate_limited", retryAfter: rl.retryAfter },
      { status: 429 }
    );
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  }
  try {
    const c = await getCustomerForLogin(parsed.data.email);
    if (!c || !(await verifyCustomerPassword(parsed.data.password, c.passwordHash))) {
      return NextResponse.json(
        { ok: false, error: "invalid_credentials" },
        { status: 401 }
      );
    }
    const session = await getSession();
    session.customer = {
      email: c.email,
      name: c.name,
      phone: c.phone,
      whatsapp: c.whatsapp || undefined,
      loggedInAt: new Date().toISOString(),
    };
    await session.save();
    return NextResponse.json({
      ok: true,
      customer: { email: c.email, name: c.name },
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 503 }
    );
  }
}
