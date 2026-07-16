import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, unstable_setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { locales, type Locale } from "@/lib/i18n-config";
import { ThemeProvider } from "@/components/theme-provider";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { ThemeStyle } from "@/components/theme-style";
import { SeoJsonLd } from "@/components/seo-jsonld";
import { getImageSlot, imageAlt } from "@/lib/content";
import { cldUrl } from "@/lib/cloudinary-url";
import { SITE_NAME, OG_LOCALE, seoFor, type SeoLocale } from "@/lib/site";

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const seo = seoFor(locale);
  const fullTitle = `${seo.title} · ${SITE_NAME}`;
  const og = await getImageSlot("og-default").catch(() => null);
  const images = og?.publicId
    ? [
        {
          url: cldUrl(og.publicId, { width: 1200 }),
          width: 1200,
          height: 630,
          alt: imageAlt(og, locale) || seo.title,
        },
      ]
    : undefined;

  // No title.template anywhere — titles are used verbatim so the site-name
  // suffix is never applied twice (cascading templates doubled it before).
  return {
    title: fullTitle,
    description: seo.description,
    keywords: seo.keywords,
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      locale: OG_LOCALE[locale as SeoLocale] ?? "ru_RU",
      title: fullTitle,
      description: seo.description,
      images,
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description: seo.description,
      images: images?.map((i) => i.url),
    },
  };
}

export default async function LocaleLayout({
  children,
  params: { locale },
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  if (!locales.includes(locale as Locale)) notFound();
  unstable_setRequestLocale(locale);
  const messages = await getMessages();

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <ThemeStyle />
      <SeoJsonLd locale={locale} />
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        <div className="flex min-h-screen flex-col">
          <SiteHeader />
          <main className="flex-1">{children}</main>
          <SiteFooter />
        </div>
      </ThemeProvider>
    </NextIntlClientProvider>
  );
}
