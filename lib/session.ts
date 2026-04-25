import { getIronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";

export interface AppSession {
  vin?: string;
  vehicle?: { make: string; model: string; year: string };
  lastSearch?: {
    kind: "article" | "name";
    query: string;
  };
  user?: {
    email: string;
    role: "owner" | "manager";
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
