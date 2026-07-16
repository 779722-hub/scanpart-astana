import { getTranslations, unstable_setRequestLocale } from "next-intl/server";
import Link from "next/link";
import { Check } from "lucide-react";
import { getAllSettings } from "@/lib/sheets/settings";
import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { SeoFaqJsonLd } from "@/components/seo-faq-jsonld";

interface InfoItem {
  title: string;
  body: string;
}
interface InfoSection {
  title: string;
  items: InfoItem[];
}

export function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return pageMetadata("info", locale);
}

export default async function InfoPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  unstable_setRequestLocale(locale);
  const t = await getTranslations("info");
  const tNav = await getTranslations("nav");
  const settings = await getAllSettings().catch(() => null);

  // Всё, что настраивается в админке, подставляем — иначе страница разойдётся
  // с реальностью, как только поменяют цену или адрес. Лишние параметры
  // строки просто игнорируют.
  const vars = {
    price: settings?.expressDeliveryPrice ?? 4000,
    expressHours: settings?.expressHours ?? "Пн-Сб 09:00–16:00",
    pickupAddress: settings?.pickupAddress ?? "г. Астана, пр. Республики, 68",
    pickupHours: settings?.pickupHours ?? "завтра 14:00–18:00",
  };

  const sections = t.raw("sections") as InfoSection[];

  // Для FAQ-разметки берём ровно тот текст, что видит человек: Google требует
  // совпадения, иначе разметка считается нарушением.
  const faq = sections.flatMap((s, i) =>
    s.items.map((_, j) => ({
      title: t(`sections.${i}.items.${j}.title`),
      body: t(`sections.${i}.items.${j}.body`, vars),
    }))
  );

  return (
    <section className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-16">
      <SeoFaqJsonLd items={faq} />
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
        {t("title")}
      </h1>
      <p className="mt-3 max-w-2xl text-pretty text-lg leading-relaxed text-ink-mute dark:text-paper-mute">
        {t("intro")}
      </p>

      <div className="mt-10 space-y-10">
        {sections.map((s, i) => (
          <div key={i}>
            <h2 className="text-xl font-bold tracking-tight sm:text-2xl">
              {t(`sections.${i}.title`)}
            </h2>
            <ul className="mt-4 space-y-3">
              {s.items.map((_, j) => (
                <li key={j} className="card flex items-start gap-3">
                  <span className="mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full bg-brand/10">
                    <Check className="h-3 w-3 text-brand" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <div className="font-semibold">
                      {t(`sections.${i}.items.${j}.title`)}
                    </div>
                    <p className="mt-1 text-pretty text-sm leading-relaxed text-ink-mute dark:text-paper-mute">
                      {t(`sections.${i}.items.${j}.body`, vars)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="mt-10 flex flex-col gap-3 sm:flex-row">
        <Link href={`/${locale}/search/vin`} className="btn-primary">
          {t("ctaVin")}
        </Link>
        <Link href={`/${locale}`} className="btn-secondary">
          {tNav("home")}
        </Link>
      </div>
    </section>
  );
}
