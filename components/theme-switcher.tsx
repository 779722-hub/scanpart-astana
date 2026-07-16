"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown } from "lucide-react";

const selectCls =
  // text-base на мобильном — иначе iOS зумит страницу при тапе по select
  "h-11 appearance-none cursor-pointer rounded-2xl border border-paper-mute bg-white pl-2.5 pr-5 text-base font-semibold leading-none text-ink transition hover:bg-paper focus:outline-none focus:ring-1 focus:ring-brand dark:border-ink-mute dark:bg-ink-soft dark:text-paper sm:h-9 sm:text-sm";
const caretCls =
  "pointer-events-none absolute right-1 top-1/2 h-3 w-3 -translate-y-1/2 opacity-50";

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  const t = useTranslations("nav");
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Icons only — the closed control shows just the glyph to save space on
  // mobile. `title` carries the readable name for accessibility.
  const options: { value: string; icon: string; label: string }[] = [
    { value: "light", icon: "☀", label: t("themeLight") },
    { value: "dark", icon: "☾", label: t("themeDark") },
    { value: "system", icon: "🖥", label: t("themeAuto") },
  ];

  return (
    <span className="relative inline-flex">
      <select
        aria-label={t("themeAuto")}
        title={options.find((o) => o.value === (mounted ? theme : "system"))?.label}
        value={mounted ? theme ?? "system" : "system"}
        onChange={(e) => setTheme(e.target.value)}
        className={selectCls}
      >
        {options.map(({ value, icon, label }) => (
          <option key={value} value={value} title={label}>
            {icon}
          </option>
        ))}
      </select>
      <ChevronDown className={caretCls} />
    </span>
  );
}
