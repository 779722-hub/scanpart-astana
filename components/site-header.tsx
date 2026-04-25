import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Wrench } from "lucide-react";
import { LocaleSwitcher } from "./locale-switcher";
import { ThemeSwitcher } from "./theme-switcher";
import { getThemeMap } from "@/lib/content";

export async function SiteHeader() {
  const locale = await getLocale();
  const t = await getTranslations("brand");
  const theme = await getThemeMap().catch(() => ({} as Record<string, string>));
  const logoText = theme.logo_text || t("name");

  return (
    <header className="sticky top-0 z-40 border-b border-paper-mute/60 bg-paper/80 backdrop-blur dark:border-ink-mute/60 dark:bg-ink/80">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-2 px-3 sm:h-16 sm:gap-3 sm:px-6">
        <Link
          href={`/${locale}`}
          className="group flex min-w-0 items-center gap-2 font-bold tracking-tight"
        >
          <span className="flex h-8 w-8 flex-none items-center justify-center rounded-2xl bg-brand text-white shadow-card transition group-hover:scale-105 sm:h-9 sm:w-9">
            <Wrench className="h-4 w-4" />
          </span>
          <span className="truncate text-base sm:text-xl">{logoText}</span>
        </Link>
        <div className="flex flex-none items-center gap-1.5 sm:gap-2">
          <LocaleSwitcher />
          <ThemeSwitcher />
        </div>
      </div>
    </header>
  );
}
