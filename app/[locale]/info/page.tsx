import { getTranslations, unstable_setRequestLocale } from "next-intl/server";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";

export default async function InfoPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  unstable_setRequestLocale(locale);
  const t = await getTranslations("info");
  const tNav = await getTranslations("nav");
  const lines = t.raw("lines") as string[];

  return (
    <section className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-16">
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
        {t("title")}
      </h1>
      <ul className="mt-6 space-y-3">
        {lines.map((line, i) => (
          <li key={i} className="card flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 flex-none text-brand" />
            <p className="text-pretty">{line}</p>
          </li>
        ))}
      </ul>
      <div className="mt-8">
        <Link href={`/${locale}`} className="btn-primary">
          {tNav("home")}
        </Link>
      </div>
    </section>
  );
}
