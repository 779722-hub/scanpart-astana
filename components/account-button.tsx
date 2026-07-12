"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { User, LogOut, Loader2 } from "lucide-react";

// `signedIn` is passed from the server (site-header reads the session), so it
// is always correct on render and re-syncs whenever the server layout is
// refreshed (login/logout call router.refresh()). No client fetch, no drift.
export function AccountButton({ signedIn }: { signedIn: boolean }) {
  const locale = useLocale();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  async function logout() {
    setLoggingOut(true);
    try {
      await fetch("/api/customer/auth/logout", { method: "POST" });
      router.refresh();
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <div className="inline-flex items-center gap-1">
      <Link
        href={`/${locale}/account`}
        className="inline-flex h-8 items-center justify-center gap-1.5 rounded-2xl border border-paper-mute bg-white px-2.5 text-sm font-semibold transition hover:border-ink-mute sm:h-9 sm:px-3 dark:border-ink-mute dark:bg-ink-soft"
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
      {signedIn && (
        <button
          onClick={logout}
          disabled={loggingOut}
          className="inline-flex h-8 items-center justify-center rounded-2xl border border-paper-mute bg-white px-2.5 text-ink transition hover:border-brand hover:text-brand disabled:opacity-50 sm:h-9 sm:px-3 dark:border-ink-mute dark:bg-ink-soft dark:text-paper"
          aria-label="Выйти"
          title="Выйти"
        >
          {loggingOut ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <LogOut className="h-4 w-4" />
          )}
        </button>
      )}
    </div>
  );
}
