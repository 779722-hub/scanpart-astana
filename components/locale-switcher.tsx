"use client";

import { useLocale } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import { locales } from "@/lib/i18n-config";
import { cn } from "@/lib/cn";

const LABELS: Record<string, { flag: string; short: string }> = {
  ru: { flag: "🇷🇺", short: "RU" },
  kk: { flag: "🇰🇿", short: "KZ" },
  en: { flag: "🇬🇧", short: "EN" },
};

export function LocaleSwitcher() {
  const active = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  function switchTo(next: string) {
    const segments = pathname.split("/");
    // segments[0] === "" because pathname starts with "/"
    segments[1] = next;
    router.push(segments.join("/") || `/${next}`);
  }

  return (
    <div
      role="radiogroup"
      className="inline-flex rounded-2xl border border-paper-mute bg-white p-0.5 sm:p-1 dark:border-ink-mute dark:bg-ink-soft"
    >
      {locales.map((l) => {
        const is = l === active;
        return (
          <button
            key={l}
            role="radio"
            aria-checked={is}
            onClick={() => switchTo(l)}
            className={cn(
              "flex h-8 items-center gap-1 rounded-xl px-2 text-xs font-semibold transition sm:h-9 sm:gap-1.5 sm:px-3 sm:text-sm",
              is
                ? "bg-brand text-white shadow-card"
                : "text-ink-mute hover:bg-paper dark:text-paper-mute dark:hover:bg-ink"
            )}
          >
            <span aria-hidden className="hidden sm:inline">{LABELS[l].flag}</span>
            <span>{LABELS[l].short}</span>
          </button>
        );
      })}
    </div>
  );
}
