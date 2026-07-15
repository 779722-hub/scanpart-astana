import { unstable_setRequestLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { LogIn } from "lucide-react";
import { VinSearchForm } from "@/components/vin-search-form";
import { getSession } from "@/lib/session";
import { findCustomer } from "@/lib/sheets/client";
import { vinOcrEnabled } from "@/lib/vin/ocr";

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
  const tv = await getTranslations("vehicleBar");
  let savedVins: string[] = [];
  if (session.customer) {
    const c = await findCustomer(session.customer.email).catch(() => null);
    savedVins = c?.vins ?? [];
  }
  const ocrEnabled = await vinOcrEnabled();
  return (
    <section className="mx-auto max-w-2xl space-y-4 px-4 py-10 sm:px-6 sm:py-16">
      {!session.customer && (
        <Link
          href={`/${locale}/account`}
          className="card flex items-center gap-3 !py-3 transition hover:shadow-cardHover"
        >
          <span className="flex h-9 w-9 flex-none items-center justify-center rounded-2xl bg-brand/10 text-brand">
            <LogIn className="h-5 w-5" />
          </span>
          <span className="text-sm text-ink-mute dark:text-paper-mute">
            {tv("savePrompt")}
          </span>
        </Link>
      )}
      <VinSearchForm
        locale={locale}
        initialVin={initialVin}
        savedVins={savedVins}
        ocrEnabled={ocrEnabled}
      />
    </section>
  );
}
