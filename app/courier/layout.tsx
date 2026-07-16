import type { Metadata } from "next";
import { noindexMetadata } from "@/lib/seo";
import { manrope } from "@/lib/font";

/**
 * Приложение курьера — внутренний инструмент, ему в поиске не место.
 *
 * Сама страница — клиентский компонент, метаданные в ней не объявить, поэтому
 * noindex живёт здесь. Раньше страница отдавала «index, follow» и заголовок
 * главной, то есть могла попасть в выдачу дублем магазина.
 *
 * follow=false: уводить робота по ссылкам внутрь рабочего приложения незачем.
 */
export const metadata: Metadata = noindexMetadata(
  "Доставка — приложение курьера",
  false
);

export default function CourierLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Своя <html>: корневой layout её больше не рендерит, а приложение курьера
  // живёт вне локалей — интерфейс у него русский.
  return (
    <html lang="ru" suppressHydrationWarning className={manrope.variable}>
      <body>{children}</body>
    </html>
  );
}
