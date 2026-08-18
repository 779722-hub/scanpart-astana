import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/guards";
import { createUser, listAllUsers } from "@/lib/auth/users";

export const runtime = "nodejs";

export async function GET() {
  const guard = await requireRole("owner");
  if (guard instanceof NextResponse) return guard;
  const users = await listAllUsers();
  // Strip password hashes — never expose them.
  return NextResponse.json({
    ok: true,
    users: users.map(({ passwordHash: _ph, ...rest }) => rest),
  });
}

const postSchema = z.object({
  email: z.string().email().max(120),
  password: z.string().min(12).max(200),
  role: z.enum(["owner", "manager"]),
});

export async function POST(req: NextRequest) {
  const guard = await requireRole("owner");
  if (guard instanceof NextResponse) return guard;
  const parsed = postSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  }
  try {
    await createUser(parsed.data);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = (err as Error).message;
    return NextResponse.json(
      { ok: false, error: msg },
      { status: msg === "user_exists" ? 409 : 500 }
    );
  }
}
