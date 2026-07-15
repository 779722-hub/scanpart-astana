import { unstable_setRequestLocale } from "next-intl/server";
import Link from "next/link";
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
      <p className="mt-4 text-center text-sm text-ink-mute dark:text-paper-mute">
        Если вы не уверены в точном парт-номере запчасти, надёжнее подобрать её
        через{" "}
        <Link
          href={`/${locale}/search/vin`}
          className="font-semibold text-brand underline"
        >
          VIN-код вашего авто
        </Link>
        .
      </p>
    </section>
  );
}
