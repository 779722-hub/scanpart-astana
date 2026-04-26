import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { changePassword, createUser } from "@/lib/auth/users";
import { findUser } from "@/lib/sheets/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Аварийный сброс пароля для админа.
 *
 * Защита: поле `token` должно совпадать с env BOOTSTRAP_TOKEN. Перезаписать
 * BOOTSTRAP_TOKEN в Vercel UI можно даже если значение «Sensitive» — это
 * единственный способ получить контроль обратно, когда забыт пароль.
 *
 * Если пользователя с email нет в Sheets — создаст его как owner.
 */
const schema = z.object({
  email: z.string().email().max(120),
  newPassword: z.string().min(12).max(200),
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
  const existing = await findUser(parsed.data.email);
  if (existing) {
    await changePassword(parsed.data.email, parsed.data.newPassword);
    return NextResponse.json({ ok: true, action: "password_changed" });
  }
  await createUser({
    email: parsed.data.email,
    password: parsed.data.newPassword,
    role: "owner",
  });
  return NextResponse.json({ ok: true, action: "owner_created" });
}
