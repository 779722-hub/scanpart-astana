import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

export type Role = "owner" | "manager";

export interface AuthedUser {
  email: string;
  role: Role;
  loggedInAt: string;
}

export async function getCurrentUser(): Promise<AuthedUser | null> {
  const session = await getSession();
  return session.user ?? null;
}

/**
 * For API routes. Returns the user OR a NextResponse to short-circuit with 401/403.
 *
 * Example:
 *   const guard = await requireRole("owner");
 *   if (guard instanceof NextResponse) return guard;
 *   const user = guard;  // typed AuthedUser
 */
export async function requireRole(...roles: Role[]): Promise<AuthedUser | NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (roles.length && !roles.includes(user.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  return user;
}

export async function requireAuth(): Promise<AuthedUser | NextResponse> {
  return requireRole("owner", "manager");
}
