import { unstable_setRequestLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { ResultsList } from "@/components/results-list";

export default async function ResultsPage({
  params: { locale },
  searchParams,
}: {
  params: { locale: string };
  searchParams: { q?: string; k?: string };
}) {
  unstable_setRequestLocale(locale);
  const t = await getTranslations("results");
  const q = (searchParams.q ?? "").trim();

  if (!q) {
    return (
      <section className="mx-auto max-w-2xl px-4 py-16 text-center">
        <Link href={`/${locale}`} className="btn-primary">
          {t("newSearch")}
        </Link>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-16">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
          <p className="mt-1 text-sm text-ink-mute dark:text-paper-mute">
            «{q}»
          </p>
        </div>
        <Link href={`/${locale}`} className="btn-secondary">
          {t("newSearch")}
        </Link>
      </div>
      <ResultsList locale={locale} q={q} />
    </section>
  );
}
