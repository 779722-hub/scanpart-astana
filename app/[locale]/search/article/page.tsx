import { unstable_setRequestLocale } from "next-intl/server";
import { SearchInputForm } from "@/components/search-input-form";

export default function ArticlePage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  unstable_setRequestLocale(locale);
  return (
    <section className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-16">
      <SearchInputForm locale={locale} kind="article" />
    </section>
  );
}
