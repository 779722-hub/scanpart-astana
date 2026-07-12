import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Private / transactional routes carry no search value and shouldn't be
      // indexed (locale prefix covered by the wildcard).
      disallow: [
        "/api/",
        "/*/admin",
        "/*/account",
        "/*/cart",
        "/*/order",
        "/*/results",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
