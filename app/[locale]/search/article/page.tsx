import { getTranslations, unstable_setRequestLocale } from "next-intl/server";
import Link from "next/link";
import { HelpCircle } from "lucide-react";
import { SearchInputForm } from "@/components/search-input-form";

export default async function ArticlePage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  unstable_setRequestLocale(locale);
  const t = await getTranslations("article");
  return (
    <section className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-16">
      <SearchInputForm locale={locale} kind="article" />
      {/* Подсказка, а не призыв: раньше висела голым текстом на фоне, а ссылка
          была жирной красной с подчёркиванием — кричала громче кнопки «Искать». */}
      <div className="mt-4 flex items-start gap-2.5 rounded-2xl bg-paper-soft px-4 py-3 text-sm text-ink-mute dark:bg-ink-soft dark:text-paper-mute">
        <HelpCircle className="mt-0.5 h-4 w-4 flex-none opacity-70" aria-hidden />
        <p className="text-pretty leading-relaxed">
          {t.rich("vinHint", {
            link: (chunks) => (
              <Link
                href={`/${locale}/search/vin`}
                className="font-semibold text-ink underline decoration-brand decoration-1 underline-offset-4 transition hover:text-brand dark:text-paper"
              >
                {chunks}
              </Link>
            ),
          })}
        </p>
      </div>
    </section>
  );
}
