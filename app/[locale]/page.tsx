import { getTranslations, unstable_setRequestLocale } from "next-intl/server";
import Link from "next/link";
import { Barcode, Hash, Info, Search } from "lucide-react";
import { getImageSlot } from "@/lib/content";
import { cldUrl } from "@/lib/cloudinary-url";

export default async function HomePage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  unstable_setRequestLocale(locale);
  const t = await getTranslations("home");
  const heroImage = await getImageSlot("hero").catch(() => null);
  const heroUrl = heroImage?.publicId ? cldUrl(heroImage.publicId, { width: 1920 }) : null;

  const cards = [
    {
      href: `/${locale}/search/vin`,
      label: t("btnVin"),
      desc: t("btnVinDesc"),
      Icon: Barcode,
      accent: "bg-brand text-white",
    },
    {
      href: `/${locale}/search/article`,
      label: t("btnArticle"),
      desc: t("btnArticleDesc"),
      Icon: Hash,
      accent: "bg-ink text-white dark:bg-paper dark:text-ink",
    },
    {
      href: `/${locale}/search/name`,
      label: t("btnName"),
      desc: t("btnNameDesc"),
      Icon: Search,
      accent: "bg-brand-600 text-white",
    },
    {
      href: `/${locale}/info`,
      label: t("btnInfo"),
      desc: t("btnInfoDesc"),
      Icon: Info,
      accent:
        "bg-paper-soft text-ink dark:bg-ink-mute dark:text-paper",
    },
  ];

  return (
    <div className="relative isolate">
      {/* hero background */}
      {heroUrl ? (
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 -z-10 h-[60vh] bg-cover bg-center"
          style={{
            backgroundImage: `linear-gradient(135deg, rgba(11,13,16,0.55) 0%, rgba(11,13,16,0.85) 100%), url(${heroUrl})`,
          }}
        />
      ) : (
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 -z-10 h-[60vh] bg-hero-day dark:bg-hero-night"
        />
      )}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 [mask-image:radial-gradient(70%_50%_at_50%_0%,#000,transparent)] bg-[url('/images/hero-grid.svg')] opacity-50"
      />

      <section className="mx-auto max-w-6xl px-4 pb-12 pt-12 sm:px-6 sm:pt-20">
        <h1 className="text-balance text-4xl font-black tracking-tight sm:text-5xl md:text-6xl">
          <span className="bg-gradient-to-r from-brand to-ink bg-clip-text text-transparent dark:to-paper">
            {t("title")}
          </span>
        </h1>
        <p className="mt-5 max-w-2xl text-pretty text-lg text-ink-mute dark:text-paper-mute">
          {t("subtitle")}
        </p>

        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map(({ href, label, desc, Icon, accent }) => (
            <Link
              key={href}
              href={href}
              className="card group flex min-h-[10rem] flex-col justify-between transition hover:-translate-y-0.5 hover:shadow-cardHover"
            >
              <span
                className={`flex h-12 w-12 items-center justify-center rounded-2xl shadow-card ${accent}`}
              >
                <Icon className="h-6 w-6" />
              </span>
              <div className="mt-6">
                <div className="text-xl font-bold">{label}</div>
                <div className="mt-1 text-sm text-ink-mute dark:text-paper-mute">
                  {desc}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
