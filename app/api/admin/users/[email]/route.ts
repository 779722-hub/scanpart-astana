import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/guards";
import { setActive, setRole } from "@/lib/auth/users";

export const runtime = "nodejs";

const schema = z.object({
  role: z.enum(["owner", "manager"]).optional(),
  active: z.boolean().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { email: string } }
) {
  const guard = await requireRole("owner");
  if (guard instanceof NextResponse) return guard;
  const email = decodeURIComponent(params.email).toLowerCase();
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  }
  try {
    if (parsed.data.role !== undefined) await setRole(email, parsed.data.role);
    if (parsed.data.active !== undefined) await setActive(email, parsed.data.active);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 404 }
    );
  }
}
