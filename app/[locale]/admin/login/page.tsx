import type { Metadata } from "next";
import { noindexMetadata } from "@/lib/seo";
import { unstable_setRequestLocale } from "next-intl/server";
import { LoginForm } from "@/components/login-form";

// Не должно быть в поиске. Именно noindex, а не Disallow в robots.txt:
// Disallow не запрещает показ адреса в выдаче и мешает роботу увидеть запрет.
export const metadata: Metadata = noindexMetadata("Вход в панель", false);

export default function LoginPage({
  params: { locale },
  searchParams,
}: {
  params: { locale: string };
  searchParams: { next?: string };
}) {
  unstable_setRequestLocale(locale);
  return (
    <section className="mx-auto max-w-md px-4 py-12 sm:px-6 sm:py-20">
      <LoginForm locale={locale} next={searchParams.next ?? `/${locale}/admin`} />
    </section>
  );
}
