import "./globals.css";
import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import { SITE_URL, SITE_NAME, seoFor, DEFAULT_LOCALE } from "@/lib/site";

const manrope = Manrope({
  subsets: ["latin", "cyrillic", "cyrillic-ext"],
  display: "swap",
  variable: "--font-manrope",
});

const seo = seoFor(DEFAULT_LOCALE);

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: `${seo.title} · ${SITE_NAME}`,
  description: seo.description,
  keywords: seo.keywords,
  applicationName: SITE_NAME,
  icons: { icon: "/favicon.svg" },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru" suppressHydrationWarning className={manrope.variable}>
      <body>{children}</body>
    </html>
  );
}
