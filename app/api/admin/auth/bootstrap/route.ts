import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createUser, isFirstUser } from "@/lib/auth/users";

export const runtime = "nodejs";

const schema = z.object({
  email: z.string().email().max(120),
  password: z.string().min(12).max(200),
  token: z.string().min(8),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  }
  const expected = process.env.BOOTSTRAP_TOKEN;
  if (!expected || parsed.data.token !== expected) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  if (!(await isFirstUser())) {
    return NextResponse.json({ ok: false, error: "already_bootstrapped" }, { status: 409 });
  }
  await createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    role: "owner",
  });
  return NextResponse.json({ ok: true });
}
