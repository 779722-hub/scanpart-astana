import { getAllSettings } from "@/lib/sheets/settings";
import { getImageSlot } from "@/lib/content";
import { cldUrl } from "@/lib/cloudinary-url";
import { SITE_URL, SITE_NAME } from "@/lib/site";

/**
 * Structured data (JSON-LD) for rich results and strong local SEO around
 * "автозапчасти в Астане": Organization + WebSite (sitelinks search box) +
 * AutoPartsStore (address, phone, area served). Rendered site-wide.
 */
export async function SeoJsonLd({ locale }: { locale: string }) {
  const [settings, og] = await Promise.all([
    getAllSettings().catch(() => null),
    getImageSlot("og-default").catch(() => null),
  ]);

  const image = og?.publicId
    ? cldUrl(og.publicId, { width: 1200 })
    : `${SITE_URL}/favicon.svg`;

  const store: Record<string, unknown> = {
    "@type": ["Store", "AutoPartsStore"],
    "@id": `${SITE_URL}/#store`,
    name: SITE_NAME,
    url: SITE_URL,
    image,
    priceCurrency: "KZT",
    areaServed: { "@type": "City", name: "Астана" },
    address: {
      "@type": "PostalAddress",
      addressLocality: "Астана",
      addressCountry: "KZ",
      streetAddress: settings?.pickupAddress || "г. Астана",
    },
  };
  if (settings?.managerPhoneDisplay) store.telephone = settings.managerPhoneDisplay;
  if (settings?.expressHours) store.openingHours = settings.expressHours;

  const graph = [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#org`,
      name: SITE_NAME,
      url: SITE_URL,
      logo: image,
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: SITE_URL,
      name: SITE_NAME,
      inLanguage: locale,
      publisher: { "@id": `${SITE_URL}/#org` },
      potentialAction: {
        "@type": "SearchAction",
        target: {
          "@type": "EntryPoint",
          urlTemplate: `${SITE_URL}/${locale}/results?q={search_term_string}`,
        },
        "query-input": "required name=search_term_string",
      },
    },
    store,
  ];

  const json = { "@context": "https://schema.org", "@graph": graph };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(json) }}
    />
  );
}
