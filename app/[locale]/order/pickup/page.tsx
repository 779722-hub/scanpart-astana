import { unstable_setRequestLocale } from "next-intl/server";
import { OrderForm } from "@/components/order-form";

export default function PickupOrderPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  unstable_setRequestLocale(locale);
  return (
    <section className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
      <OrderForm locale={locale} kind="pickup" />
    </section>
  );
}
