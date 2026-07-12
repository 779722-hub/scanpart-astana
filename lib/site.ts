/**
 * Central site/SEO config. The canonical domain drives metadataBase, Open
 * Graph, canonical URLs, sitemap and structured data — set NEXT_PUBLIC_SITE_URL
 * to the live domain (https://scanpart.kz) in the deploy environment.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || "https://scanpart.kz"
).replace(/\/+$/, "");

export const SITE_NAME = process.env.NEXT_PUBLIC_SITE_NAME || "SCANPART.ASTANA";

export const LOCALES = ["ru", "kk", "en"] as const;
export type SeoLocale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: SeoLocale = "ru";

export const OG_LOCALE: Record<SeoLocale, string> = {
  ru: "ru_RU",
  kk: "kk_KZ",
  en: "en_US",
};

interface SeoCopy {
  title: string;
  description: string;
  keywords: string[];
}

/** Keyword-rich, localized default metadata. RU is the primary audience. */
export const SEO: Record<SeoLocale, SeoCopy> = {
  ru: {
    title: "Автозапчасти в Астане — поиск по VIN, номеру и названию",
    description:
      "SCANPART.ASTANA — быстрый поиск автозапчастей в Астане по VIN, парт-номеру и названию. Наличие на складе в Астане, оригинал и лучшие аналоги, цена сразу, доставка и самовывоз.",
    keywords: [
      "автозапчасти астана",
      "запчасти астана",
      "купить запчасти астана",
      "запчасти по vin",
      "поиск по вин коду",
      "подбор запчастей по vin",
      "оригинальные запчасти астана",
      "аналоги запчастей",
      "запчасти в наличии астана",
      "доставка запчастей астана",
    ],
  },
  kk: {
    title: "Астанада автобөлшектер — VIN, нөмір және атау бойынша іздеу",
    description:
      "SCANPART.ASTANA — Астанада автобөлшектерді VIN, парт-нөмір және атау бойынша жылдам іздеу. Астана қоймасында бар, түпнұсқа және ең үздік баламалар, бағасы бірден, жеткізу және өзің алып кету.",
    keywords: [
      "астана автобөлшектер",
      "автобөлшектер астана",
      "vin бойынша бөлшектер",
      "автобөлшектерді жеткізу астана",
      "түпнұсқа автобөлшектер",
    ],
  },
  en: {
    title: "Car parts in Astana — search by VIN, number and name",
    description:
      "SCANPART.ASTANA — fast car-parts search in Astana by VIN, part number and name. In stock at the Astana warehouse, OEM and best analogs, instant pricing, delivery and pickup.",
    keywords: [
      "car parts astana",
      "auto parts astana",
      "parts by vin",
      "oem parts astana",
      "car parts delivery astana",
    ],
  },
};

export function seoFor(locale: string): SeoCopy {
  return SEO[(LOCALES as readonly string[]).includes(locale) ? (locale as SeoLocale) : DEFAULT_LOCALE];
}
