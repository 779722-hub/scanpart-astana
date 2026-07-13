import createMiddleware from "next-intl/middleware";
import { NextRequest, NextResponse } from "next/server";
import { locales, defaultLocale } from "./lib/i18n-config";

const intlMiddleware = createMiddleware({
  locales: [...locales],
  defaultLocale,
  localePrefix: "always",
});

const SESSION_COOKIE = "scanpart_sess";
const ADMIN_PAGE_RE = /^\/(ru|kk|en)\/admin(\/|$)/;
const ADMIN_LOGIN_RE = /^\/(ru|kk|en)\/admin\/login(\/|$)/;
const PUBLIC_API_AUTH_RE =
  /^\/api\/admin\/(auth\/(login|bootstrap)|setup|diag)(\/|$)/;

function hasSessionCookie(req: NextRequest): boolean {
  return Boolean(req.cookies.get(SESSION_COOKIE)?.value);
}

export default function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // /api/admin/* — require session cookie (deep auth happens in the route).
  // Public exceptions: login + bootstrap.
  if (pathname.startsWith("/api/admin")) {
    if (!PUBLIC_API_AUTH_RE.test(pathname) && !hasSessionCookie(req)) {
      return NextResponse.json(
        { ok: false, error: "unauthorized" },
        { status: 401 }
      );
    }
    return NextResponse.next();
  }

  // Other API routes pass through (next-intl skips /api by matcher anyway).
  if (pathname.startsWith("/api")) return NextResponse.next();

  // Courier web app lives outside the [locale] tree — skip i18n routing.
  if (pathname === "/courier" || pathname.startsWith("/courier/")) {
    return NextResponse.next();
  }

  // Admin pages — redirect to login when no session cookie.
  if (ADMIN_PAGE_RE.test(pathname) && !ADMIN_LOGIN_RE.test(pathname)) {
    if (!hasSessionCookie(req)) {
      const locale = pathname.split("/")[1] || defaultLocale;
      const next = encodeURIComponent(req.nextUrl.pathname + req.nextUrl.search);
      const url = req.nextUrl.clone();
      url.pathname = `/${locale}/admin/login`;
      url.search = `?next=${next}`;
      return NextResponse.redirect(url);
    }
  }

  return intlMiddleware(req);
}

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)"],
};
