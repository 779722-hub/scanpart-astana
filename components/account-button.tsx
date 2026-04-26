"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale } from "next-intl";
import { User } from "lucide-react";

export function AccountButton() {
  const locale = useLocale();
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/customer/me")
      .then((r) => {
        if (cancelled) return;
        setSignedIn(r.ok);
      })
      .catch(() => !cancelled && setSignedIn(false));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Link
      href={`/${locale}/account`}
      className="inline-flex h-8 items-center justify-center gap-1.5 rounded-2xl border border-paper-mute bg-white px-2.5 text-sm font-semibold transition hover:border-ink-mute sm:h-9 sm:px-3 dark:border-ink-mute dark:bg-ink-soft"
      aria-label="Личный кабинет"
    >
      <User className="h-4 w-4" />
      {signedIn ? (
        <span className="hidden sm:inline">Кабинет</span>
      ) : (
        <span className="hidden sm:inline">Войти</span>
      )}
      {signedIn && (
        <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
      )}
    </Link>
  );
}
