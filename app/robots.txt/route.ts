import { SITE_URL } from "@/lib/site";

export const runtime = "nodejs";

/**
 * robots.txt собран вручную, а не через MetadataRoute.Robots: типы Next не
 * знают про Clean-param, а он нужен Яндексу.
 *
 * Почему почти ничего не запрещено. Раньше приватные пути (админка, корзина,
 * оформление, кабинет, выдача) были закрыты через Disallow — и это работало
 * против нас: Disallow запрещает СКАНИРОВАТЬ, но не запрещает показывать адрес
 * в выдаче, и заодно не даёт роботу увидеть noindex на самой странице.
 * Получался тупик: страница закрыта от робота и поэтому навсегда остаётся
 * кандидатом в индекс. Теперь на этих страницах стоит noindex (см. lib/seo),
 * а роботу разрешено зайти и его прочитать.
 *
 * Disallow оставлен только для /api/ — там нечего индексировать и нечего
 * помечать noindex (это JSON, а не страницы).
 *
 * Host убран намеренно: Яндекс отменил директиву в 2018 году, зеркало теперь
 * определяется по canonical и редиректу. Оба у нас есть.
 */
export async function GET(): Promise<Response> {
  const body = [
    "User-agent: *",
    "Allow: /",
    "Disallow: /api/",
    "",
    // Метки рекламных кампаний не меняют содержимое страницы. Без этого Яндекс
    // считает /ru?utm_source=… отдельным адресом и плодит дубли.
    "Clean-param: utm_source&utm_medium&utm_campaign&utm_term&utm_content&gclid&yclid&fbclid&_openstat",
    "",
    `Sitemap: ${SITE_URL}/sitemap.xml`,
    "",
  ].join("\n");

  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
}
