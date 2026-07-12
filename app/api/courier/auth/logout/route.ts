import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

export async function POST() {
  const session = await getSession();
  session.courier = undefined;
  await session.save();
  return NextResponse.json({ ok: true });
}
