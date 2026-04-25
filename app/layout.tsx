import "./globals.css";
import { Manrope } from "next/font/google";

const manrope = Manrope({
  subsets: ["latin", "cyrillic", "cyrillic-ext"],
  display: "swap",
  variable: "--font-manrope",
});

export const metadata = {
  title: "SCANPART.ASTANA — быстрый поиск автозапчастей",
  description:
    "Поиск автозапчастей по VIN, парт-номеру и названию на складе Астана",
  icons: { icon: "/favicon.svg" },
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
