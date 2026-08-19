import type { Metadata } from "next";
import { noindexMetadata } from "@/lib/seo";
import { unstable_setRequestLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { ResultsList } from "@/components/results-list";

export const dynamic = "force-dynamic";

// Не должно быть в поиске. Именно noindex, а не Disallow в robots.txt:
// Disallow не запрещает показ адреса в выдаче и мешает роботу увидеть запрет.
export const metadata: Metadata = noindexMetadata("Результаты поиска");

export default async function ResultsPage({
  params: { locale },
  searchParams,
}: {
  params: { locale: string };
  searchParams: { q?: string; k?: string; strict?: string; anycar?: string };
}) {
  unstable_setRequestLocale(locale);
  const t = await getTranslations("results");
  const q = (searchParams.q ?? "").trim();
  const strict = searchParams.strict === "1";
  const kind: "article" | "name" = searchParams.k === "name" ? "name" : "article";
  const anyCar = searchParams.anycar === "1";

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
      <div className="mb-6 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            {t("title")}
          </h1>
          <p className="mt-1 truncate text-sm text-ink-mute dark:text-paper-mute">
            «{q}»
          </p>
        </div>
        {/* flex-none + nowrap: на 390px кнопка иначе ломалась на две строки */}
        <Link
          href={`/${locale}`}
          className="btn-secondary flex-none whitespace-nowrap px-4 py-2.5 text-sm sm:px-6 sm:py-4 sm:text-base"
        >
          {t("newSearch")}
        </Link>
      </div>
      <ResultsList locale={locale} q={q} strict={strict} kind={kind} anyCar={anyCar} />
    </section>
  );
}
