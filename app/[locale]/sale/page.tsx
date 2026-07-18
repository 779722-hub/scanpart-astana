import type { Metadata } from "next";
import { unstable_setRequestLocale } from "next-intl/server";
import { SaleList } from "@/components/sale-list";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Распродажа автозапчастей в Астане · SCANPART.ASTANA",
  description: "Автозапчасти по сниженным ценам, в наличии в Астане. Оригиналы и проверенные аналоги.",
};

export default function SalePage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  unstable_setRequestLocale(locale);
  return <SaleList locale={locale} />;
}
