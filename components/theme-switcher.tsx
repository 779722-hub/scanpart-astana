"use client";

import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/cn";

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  const t = useTranslations("nav");
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const options: { value: string; Icon: typeof Sun; label: string }[] = [
    { value: "light", Icon: Sun, label: t("themeLight") },
    { value: "system", Icon: Monitor, label: t("themeAuto") },
    { value: "dark", Icon: Moon, label: t("themeDark") },
  ];

  return (
    <div
      role="radiogroup"
      aria-label={t("themeAuto")}
      className="inline-flex rounded-2xl border border-paper-mute bg-white p-0.5 sm:p-1 dark:border-ink-mute dark:bg-ink-soft"
    >
      {options.map(({ value, Icon, label }) => {
        const active = mounted && theme === value;
        return (
          <button
            key={value}
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => setTheme(value)}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-xl transition sm:h-9 sm:w-9",
              active
                ? "bg-brand text-white shadow-card"
                : "text-ink-mute hover:bg-paper dark:text-paper-mute dark:hover:bg-ink"
            )}
          >
            <Icon className="h-4 w-4" />
          </button>
        );
      })}
    </div>
  );
}
