import { getTranslations } from "next-intl/server";

export async function SiteFooter() {
  const t = await getTranslations("brand");
  const year = new Date().getFullYear();
  return (
    <footer className="mt-12 border-t border-paper-mute/60 bg-paper-soft py-8 text-center text-sm text-ink-mute sm:mt-20 dark:border-ink-mute/60 dark:bg-ink-soft dark:text-paper-mute">
      © {year} · {t("name")} · {t("tagline")}
    </footer>
  );
}
