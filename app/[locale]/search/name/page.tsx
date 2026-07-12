import { unstable_setRequestLocale } from "next-intl/server";
import { SearchInputForm } from "@/components/search-input-form";
import { CopyVin } from "@/components/copy-vin";
import { getSession } from "@/lib/session";
import { Car } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function NamePage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  unstable_setRequestLocale(locale);
  const session = await getSession();
  const vehicle = session.vehicle ?? null;

  return (
    <section className="mx-auto max-w-2xl space-y-4 px-4 py-10 sm:px-6 sm:py-16">
      {vehicle && (
        <div className="card flex items-start gap-3">
          <Car className="mt-1 h-5 w-5 flex-none text-brand" />
          <div className="space-y-2 text-sm">
            <div>
              <span className="text-ink-mute dark:text-paper-mute">Поиск для:</span>{" "}
              <strong>
                {vehicle.make} {vehicle.model !== "—" ? vehicle.model : ""}{" "}
                {vehicle.year !== "—" ? vehicle.year : ""}
              </strong>
            </div>
            <div className="text-ink-mute dark:text-paper-mute">
              Введите название (например «передние колодки») — покажем то, что есть в
              Астане и подходит именно для вашего авто.
            </div>
          </div>
        </div>
      )}

      <SearchInputForm locale={locale} kind="name" />

      {vehicle && session.vin && (
        <div className="card space-y-3">
          <CopyVin vin={session.vin} />
          <p className="text-xs text-ink-mute dark:text-paper-mute">
            Нашли точный парт-номер? Введите его в{" "}
            <a className="underline" href={`/${locale}/search/article`}>
              поиске по парт-номеру
            </a>
            .
          </p>
        </div>
      )}
    </section>
  );
}
