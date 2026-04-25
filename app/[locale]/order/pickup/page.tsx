import { unstable_setRequestLocale } from "next-intl/server";
import { OrderForm, type SelectedPart } from "@/components/order-form";

export default function PickupOrderPage({
  params: { locale },
  searchParams,
}: {
  params: { locale: string };
  searchParams: Record<string, string | string[] | undefined>;
}) {
  unstable_setRequestLocale(locale);
  const part: SelectedPart = {
    brand: String(searchParams.brand ?? ""),
    article: String(searchParams.article ?? ""),
    name: String(searchParams.name ?? ""),
    price: Number(searchParams.price ?? 0),
    quantity: Number(searchParams.qty ?? 1),
    availableQty: Number(searchParams.available ?? 1) || 1,
  };
  return (
    <section className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-16">
      <OrderForm locale={locale} kind="pickup" part={part} />
    </section>
  );
}
