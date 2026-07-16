import type { Metadata } from "next";
import { noindexMetadata } from "@/lib/seo";
import { unstable_setRequestLocale } from "next-intl/server";
import { OrderForm } from "@/components/order-form";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

// Не должно быть в поиске. Именно noindex, а не Disallow в robots.txt:
// Disallow не запрещает показ адреса в выдаче и мешает роботу увидеть запрет.
export const metadata: Metadata = noindexMetadata("Оформление — самовывоз");

export default async function PickupOrderPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  unstable_setRequestLocale(locale);
  const c = (await getSession()).customer;
  return (
    <section className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
      <OrderForm
        locale={locale}
        kind="pickup"
        defaults={c ? { name: c.name, phone: c.phone, whatsapp: c.whatsapp } : undefined}
      />
    </section>
  );
}
