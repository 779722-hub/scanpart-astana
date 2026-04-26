import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { registerCustomer } from "@/lib/auth/customers";
import { getSession } from "@/lib/session";
import { consume } from "@/lib/auth/rate-limit";

export const runtime = "nodejs";

const phoneOk = (raw: string): boolean => {
  const d = raw.replace(/\D/g, "");
  return d.length >= 10 && d.length <= 12;
};

const schema = z.object({
  email: z.string().email().max(120),
  password: z.string().min(8).max(200),
  name: z.string().min(2).max(80),
  phone: z.string().refine(phoneOk, { message: "invalidPhone" }),
  whatsapp: z
    .string()
    .max(30)
    .refine((s) => s === "" || phoneOk(s), { message: "invalidPhone" })
    .optional()
    .or(z.literal("")),
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
  const rl = consume(`customer-register:${ip}`, 5, 1000 * 60 * 60);
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: "rate_limited", retryAfter: rl.retryAfter },
      { status: 429 }
    );
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "invalid", issues: parsed.error.issues },
      { status: 400 }
    );
  }
  try {
    await registerCustomer(parsed.data);
    const session = await getSession();
    session.customer = {
      email: parsed.data.email.toLowerCase(),
      name: parsed.data.name,
      phone: parsed.data.phone,
      whatsapp: parsed.data.whatsapp || undefined,
      loggedInAt: new Date().toISOString(),
    };
    await session.save();
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = (err as Error).message;
    return NextResponse.json(
      { ok: false, error: msg },
      { status: msg === "email_taken" ? 409 : 500 }
    );
  }
}
