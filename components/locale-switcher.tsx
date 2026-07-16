"use client";

import { useLocale } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { locales } from "@/lib/i18n-config";

const SHORT: Record<string, string> = { ru: "RU", kk: "KZ", en: "EN" };

const selectCls =
  // text-base на мобильном — иначе iOS зумит страницу при тапе по select
  "h-11 appearance-none cursor-pointer rounded-2xl border border-paper-mute bg-white pl-2.5 pr-5 text-base font-semibold leading-none text-ink transition hover:bg-paper focus:outline-none focus:ring-1 focus:ring-brand dark:border-ink-mute dark:bg-ink-soft dark:text-paper sm:h-9 sm:text-sm";
const caretCls =
  "pointer-events-none absolute right-1 top-1/2 h-3 w-3 -translate-y-1/2 opacity-50";

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
    <span className="relative inline-flex">
      <select
        aria-label="Язык / Тіл / Language"
        value={active}
        onChange={(e) => switchTo(e.target.value)}
        className={selectCls}
      >
        {locales.map((l) => (
          <option key={l} value={l}>
            {SHORT[l]}
          </option>
        ))}
      </select>
      <ChevronDown className={caretCls} />
    </span>
  );
}
