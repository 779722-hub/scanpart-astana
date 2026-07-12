"use client";

import { useLocale } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import { locales } from "@/lib/i18n-config";

const LABELS: Record<string, { flag: string; short: string }> = {
  ru: { flag: "🇷🇺", short: "RU" },
  kk: { flag: "🇰🇿", short: "KZ" },
  en: { flag: "🇬🇧", short: "EN" },
};

const selectCls =
  "h-8 cursor-pointer rounded-2xl border border-paper-mute bg-white px-2 text-xs font-semibold text-ink transition hover:bg-paper focus:outline-none focus:ring-2 focus:ring-brand/40 dark:border-ink-mute dark:bg-ink-soft dark:text-paper sm:h-9 sm:px-3 sm:text-sm";

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
    <select
      aria-label="Язык / Тіл / Language"
      value={active}
      onChange={(e) => switchTo(e.target.value)}
      className={selectCls}
    >
      {locales.map((l) => (
        <option key={l} value={l}>
          {LABELS[l].flag} {LABELS[l].short}
        </option>
      ))}
    </select>
  );
}
