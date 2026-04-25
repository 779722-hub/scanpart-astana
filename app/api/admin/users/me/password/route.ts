import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/guards";
import { changePassword, verifyPassword } from "@/lib/auth/users";
import { findUser } from "@/lib/sheets/client";

export const runtime = "nodejs";

const schema = z.object({
  currentPassword: z.string().min(8).max(200),
  newPassword: z.string().min(12).max(200),
});

export async function POST(req: NextRequest) {
  const guard = await requireAuth();
  if (guard instanceof NextResponse) return guard;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  }
  const user = await findUser(guard.email);
  if (!user || !(await verifyPassword(parsed.data.currentPassword, user.passwordHash))) {
    return NextResponse.json({ ok: false, error: "wrong_current" }, { status: 401 });
  }
  await changePassword(guard.email, parsed.data.newPassword);
  return NextResponse.json({ ok: true });
}
