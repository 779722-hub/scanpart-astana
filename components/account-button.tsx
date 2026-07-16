"use client";

import Link from "next/link";
import { useLocale } from "next-intl";
import { User } from "lucide-react";

// `signedIn` is passed from the server (site-header reads the session), so it
// is always correct on render and re-syncs whenever the server layout is
// refreshed (login/logout call router.refresh()). Logout now lives inside the
// cabinet page, not here.
export function AccountButton({ signedIn }: { signedIn: boolean }) {
  const locale = useLocale();

  return (
    <Link
      href={`/${locale}/account`}
      className="inline-flex h-11 items-center justify-center gap-1.5 rounded-2xl border border-paper-mute bg-white px-3 text-sm font-semibold transition hover:border-ink-mute sm:h-9 sm:px-3 dark:border-ink-mute dark:bg-ink-soft"
      aria-label="Личный кабинет"
    >
      <User className="h-4 w-4" />
      {signedIn ? (
        <span className="hidden sm:inline">Кабинет</span>
      ) : (
        <span>Войти</span>
      )}
      {signedIn && (
        <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
      )}
    </Link>
  );
}
