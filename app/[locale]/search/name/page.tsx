import { unstable_setRequestLocale, getTranslations } from "next-intl/server";
import { SearchInputForm } from "@/components/search-input-form";
import { getSession } from "@/lib/session";
import { ExternalLink, Car } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function NamePage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  unstable_setRequestLocale(locale);
  const session = await getSession();
  const vehicle = session.vehicle ?? null;
  const t = await getTranslations("name");

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
              Ниже введите название (например «передние колодки»). Мы покажем то, что
              есть в Астане; в карточках совпадение с маркой будет подсвечено зелёным.
            </div>
          </div>
        </div>
      )}

      <SearchInputForm
        locale={locale}
        kind="name"
        vehicle={vehicle}
      />

      {vehicle && (
        <div className="card space-y-3">
          <div className="text-sm font-semibold">
            Не нашли? Найдите точный парт-номер в каталоге:
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <a
              href="https://www.autodoc.ru/catalogs/car"
              target="_blank"
              rel="noreferrer"
              className="btn-secondary justify-between !py-3"
              title={
                session.vin
                  ? `Скопируйте VIN ${session.vin} и вставьте в поиск на autodoc.ru`
                  : undefined
              }
            >
              <span>autodoc.ru — каталог по авто</span>
              <ExternalLink className="h-4 w-4" />
            </a>
            <a
              href={`https://www.google.com/search?q=${encodeURIComponent(
                `${vehicle.make} ${vehicle.model !== "—" ? vehicle.model : ""} ${
                  vehicle.year !== "—" ? vehicle.year : ""
                } каталог запчастей VIN`
              )}`}
              target="_blank"
              rel="noreferrer"
              className="btn-secondary justify-between !py-3"
            >
              <span>Поиск в Google по вашему авто</span>
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>
          {session.vin && (
            <div className="rounded-2xl bg-paper-soft p-3 text-xs dark:bg-ink-mute">
              <div className="text-ink-mute dark:text-paper-mute">
                Ваш VIN — скопируйте и вставьте в форму autodoc.ru:
              </div>
              <div className="mt-1 select-all font-mono text-sm font-bold">
                {session.vin}
              </div>
            </div>
          )}
          <p className="text-xs text-ink-mute dark:text-paper-mute">
            Вернитесь сюда с найденным парт-номером и введите его в{" "}
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
