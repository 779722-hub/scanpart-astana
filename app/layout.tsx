import "./globals.css";
import type { Metadata } from "next";
import { SITE_URL, SITE_NAME, seoFor, DEFAULT_LOCALE } from "@/lib/site";

const seo = seoFor(DEFAULT_LOCALE);

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: `${seo.title} · ${SITE_NAME}`,
  description: seo.description,
  keywords: seo.keywords,
  applicationName: SITE_NAME,
  icons: {
    icon: [
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    shortcut: ["/favicon-32.png"],
  },
  robots: { index: true, follow: true },
};

/**
 * Корневой layout намеренно ничего не оборачивает.
 *
 * <html> переехал вниз — в layout локали и в layout курьера, — потому что
 * атрибут lang обязан совпадать с языком страницы. Раньше здесь стояло жёсткое
 * lang="ru", и казахская с английской версией объявляли себя русскими: робот
 * считал казахский текст русским, а скринридер читал его с русским
 * произношением. Отсюда язык не виден — у корневого layout нет параметров.
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
