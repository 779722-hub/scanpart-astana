import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getUserForLogin, verifyPassword } from "@/lib/auth/users";
import { getSession } from "@/lib/session";
import { consume } from "@/lib/auth/rate-limit";

export const runtime = "nodejs";

const schema = z.object({
  email: z.string().email().max(120),
  password: z.string().min(8).max(200),
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
  const rl = consume(`login:${ip}`, 5, 1000 * 60 * 10);
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: "rate_limited", retryAfter: rl.retryAfter },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  }

  try {
    const user = await getUserForLogin(parsed.data.email);
    const valid = user && (await verifyPassword(parsed.data.password, user.passwordHash));
    if (!user || !valid) {
      return NextResponse.json(
        { ok: false, error: "invalid_credentials" },
        { status: 401 }
      );
    }
    const session = await getSession();
    session.user = {
      email: user.email,
      role: user.role,
      loggedInAt: new Date().toISOString(),
    };
    session.csrfToken = cryptoRandom(32);
    await session.save();
    return NextResponse.json({
      ok: true,
      user: { email: user.email, role: user.role },
      csrf: session.csrfToken,
    });
  } catch (err) {
    console.error("[auth/login]", (err as Error).message);
    return NextResponse.json(
      { ok: false, error: "service_unavailable" },
      { status: 503 }
    );
  }
}

function cryptoRandom(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Buffer.from(arr).toString("base64url");
}
