"use client";

import Link from "next/link";
import { useLocale } from "next-intl";
import { ShoppingCart } from "lucide-react";
import { useCart } from "@/lib/cart";

export function CartButton() {
  const locale = useLocale();
  const { totalCount, hydrated } = useCart();
  const showBadge = hydrated && totalCount > 0;

  return (
    <Link
      href={`/${locale}/cart`}
      className="relative inline-flex h-8 items-center gap-1.5 rounded-2xl border border-paper-mute bg-white px-2.5 text-sm font-semibold transition hover:border-ink-mute sm:h-9 sm:px-3 dark:border-ink-mute dark:bg-ink-soft"
      aria-label="Корзина"
    >
      <ShoppingCart className="h-4 w-4" />
      <span className="hidden sm:inline">{totalCount > 0 ? totalCount : "0"}</span>
      {showBadge && (
        <span className="absolute -right-1.5 -top-1.5 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-brand px-1 text-xs font-bold text-white shadow sm:hidden">
          {totalCount > 99 ? "99+" : totalCount}
        </span>
      )}
    </Link>
  );
}
