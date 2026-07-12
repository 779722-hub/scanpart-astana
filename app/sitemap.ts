import type { MetadataRoute } from "next";
import { SITE_URL, LOCALES, DEFAULT_LOCALE } from "@/lib/site";

// Public, indexable pages. Transactional/private routes are excluded (see robots).
const PATHS = ["", "/search/vin", "/search/article", "/search/name", "/info"];

export default function sitemap(): MetadataRoute.Sitemap {
  const entries: MetadataRoute.Sitemap = [];
  for (const path of PATHS) {
    for (const locale of LOCALES) {
      entries.push({
        url: `${SITE_URL}/${locale}${path}`,
        changeFrequency: path === "" ? "daily" : "weekly",
        priority: path === "" ? 1 : 0.7,
        alternates: {
          languages: Object.fromEntries(
            LOCALES.map((l) => [l, `${SITE_URL}/${l}${path}`])
          ),
        },
      });
    }
  }
  // Root redirects to the default locale — advertise it too.
  entries.push({
    url: `${SITE_URL}/${DEFAULT_LOCALE}`,
    changeFrequency: "daily",
    priority: 1,
  });
  return entries;
}
