import { getIronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";

export interface AppSession {
  vin?: string;
  vehicle?: { make: string; model: string; year: string };
  // Set when a car is chosen via the by-model catalog wizard (no VIN). Carries
  // the Laximo triple so name search can query the catalog like a VIN does.
  vehicleRef?: { vehicleId: number; catalog: string; ssd: string };
  lastSearch?: {
    kind: "article" | "name";
    query: string;
  };
  user?: {
    email: string;
    role: "owner" | "manager";
    loggedInAt: string;
  };
  customer?: {
    email: string;
    name: string;
    phone: string;
    whatsapp?: string;
    loggedInAt: string;
  };
  csrfToken?: string;
}

export const sessionOptions: SessionOptions = {
  cookieName: "scanpart_sess",
  password:
    process.env.IRON_SESSION_PASSWORD ||
    "insecure-dev-password-change-in-prod-32chars",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24, // 24 h
  },
};

export async function getSession() {
  return getIronSession<AppSession>(cookies(), sessionOptions);
}
