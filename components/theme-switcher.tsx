"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

const selectCls =
  "h-8 cursor-pointer rounded-2xl border border-paper-mute bg-white px-2.5 text-xs font-semibold text-ink transition hover:bg-paper focus:outline-none focus:ring-2 focus:ring-brand/40 dark:border-ink-mute dark:bg-ink-soft dark:text-paper sm:h-9 sm:px-3 sm:text-sm";

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  const t = useTranslations("nav");
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const options: { value: string; label: string }[] = [
    { value: "light", label: `☀ ${t("themeLight")}` },
    { value: "dark", label: `☾ ${t("themeDark")}` },
    { value: "system", label: `🖥 ${t("themeAuto")}` },
  ];

  return (
    <select
      aria-label={t("themeAuto")}
      value={mounted ? theme ?? "system" : "system"}
      onChange={(e) => setTheme(e.target.value)}
      className={selectCls}
    >
      {options.map(({ value, label }) => (
        <option key={value} value={value}>
          {label}
        </option>
      ))}
    </select>
  );
}
