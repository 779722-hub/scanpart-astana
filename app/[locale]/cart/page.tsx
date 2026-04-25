import { unstable_setRequestLocale } from "next-intl/server";
import { CartView } from "@/components/cart-view";

export const dynamic = "force-dynamic";

export default function CartPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  unstable_setRequestLocale(locale);
  return (
    <section className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <CartView locale={locale} />
    </section>
  );
}
