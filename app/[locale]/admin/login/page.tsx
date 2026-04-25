import { unstable_setRequestLocale } from "next-intl/server";
import { LoginForm } from "@/components/login-form";

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
