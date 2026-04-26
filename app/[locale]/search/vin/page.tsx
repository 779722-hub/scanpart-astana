import { unstable_setRequestLocale } from "next-intl/server";
import { VinSearchForm } from "@/components/vin-search-form";
import { getSession } from "@/lib/session";
import { findCustomer } from "@/lib/sheets/client";

export const dynamic = "force-dynamic";

export default async function VinPage({
  params: { locale },
  searchParams,
}: {
  params: { locale: string };
  searchParams: { vin?: string };
}) {
  unstable_setRequestLocale(locale);
  const initialVin = (searchParams.vin ?? "").toUpperCase();
  const session = await getSession();
  let savedVins: string[] = [];
  if (session.customer) {
    const c = await findCustomer(session.customer.email).catch(() => null);
    savedVins = c?.vins ?? [];
  }
  return (
    <section className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-16">
      <VinSearchForm
        locale={locale}
        initialVin={initialVin}
        savedVins={savedVins}
      />
    </section>
  );
}
