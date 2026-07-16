import type { MetadataRoute } from "next";
import { SITE_URL, LOCALES, DEFAULT_LOCALE } from "@/lib/site";
import { PAGE_PATH } from "@/lib/seo";

/**
 * Публичные, индексируемые страницы. Пути берутся из PAGE_PATH — из того же
 * источника, что и метаданные страниц, поэтому карта не разойдётся с сайтом.
 *
 * Раньше главная попадала сюда дважды: один раз циклом, второй — отдельной
 * записью «/ » → «/ru». Дубль убран: /ru и так первый в списке, а корень
 * отдаёт 307 на /ru, и такие редиректы в карту не кладут.
 *
 * Приватные и транзакционные страницы (корзина, оформление, кабинет, выдача,
 * админка, приложение курьера) сюда не входят — у них noindex, см. lib/seo.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return Object.values(PAGE_PATH).flatMap((path) =>
    LOCALES.map((locale) => ({
      url: `${SITE_URL}/${locale}${path}`,
      changeFrequency: (path === "" ? "daily" : "weekly") as "daily" | "weekly",
      priority: path === "" ? 1 : 0.7,
      alternates: {
        languages: {
          ...Object.fromEntries(
            LOCALES.map((l) => [l, `${SITE_URL}/${l}${path}`])
          ),
          "x-default": `${SITE_URL}/${DEFAULT_LOCALE}${path}`,
        },
      },
    }))
  );
}
