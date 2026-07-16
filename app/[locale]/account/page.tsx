import type { Metadata } from "next";
import { noindexMetadata } from "@/lib/seo";
import { unstable_setRequestLocale } from "next-intl/server";
import { AccountView } from "@/components/account-view";

export const dynamic = "force-dynamic";

// Не должно быть в поиске. Именно noindex, а не Disallow в robots.txt:
// Disallow не запрещает показ адреса в выдаче и мешает роботу увидеть запрет.
export const metadata: Metadata = noindexMetadata("Личный кабинет");

export default function AccountPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  unstable_setRequestLocale(locale);
  return (
    <section className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <AccountView locale={locale} />
    </section>
  );
}
