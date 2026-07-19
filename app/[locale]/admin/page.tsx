import type { Metadata } from "next";
import { noindexMetadata } from "@/lib/seo";
import { unstable_setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";
import { AdminShell } from "@/components/admin/admin-shell";

export const dynamic = "force-dynamic";

// Не должно быть в поиске. Именно noindex, а не Disallow в robots.txt:
// Disallow не запрещает показ адреса в выдаче и мешает роботу увидеть запрет.
export const metadata: Metadata = noindexMetadata("Панель управления", false);

export default async function AdminPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  unstable_setRequestLocale(locale);
  const user = await getCurrentUser();
  if (!user) redirect(`/${locale}/admin/login`);

  return (
    <section className="w-full px-3 py-4 sm:px-4 sm:py-6">
      <AdminShell locale={locale} user={user} />
    </section>
  );
}
