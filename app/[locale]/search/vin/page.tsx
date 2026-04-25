import { unstable_setRequestLocale } from "next-intl/server";
import { VinSearchForm } from "@/components/vin-search-form";

export default function VinPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  unstable_setRequestLocale(locale);
  return (
    <section className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-16">
      <VinSearchForm locale={locale} />
    </section>
  );
}
