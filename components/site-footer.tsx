import { getTranslations } from "next-intl/server";

export async function SiteFooter() {
  const t = await getTranslations("brand");
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-paper-mute/60 py-6 text-center text-sm text-ink-mute dark:border-ink-mute/60 dark:text-paper-mute">
      © {year} · {t("name")} · {t("tagline")}
    </footer>
  );
}
