import { unstable_setRequestLocale } from "next-intl/server";
import Link from "next/link";
import { SearchInputForm } from "@/components/search-input-form";
import { CopyVin } from "@/components/copy-vin";
import { getSession } from "@/lib/session";
import { voiceSearchEnabled, sttServerConfigured } from "@/lib/voice/stt";
import { Car, ChevronRight } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function NamePage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  unstable_setRequestLocale(locale);
  const session = await getSession();
  const vehicle = session.vehicle ?? null;
  const [voiceOn, sttServer] = await Promise.all([
    voiceSearchEnabled(),
    sttServerConfigured(),
  ]);

  // Name search only makes sense against a chosen car — otherwise send the
  // customer to VIN search first.
  if (!vehicle) {
    return (
      <section className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-16">
        <div className="card space-y-4 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand/10 text-brand">
            <Car className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">
            Ваш автомобиль ещё не определён
          </h1>
          <p className="text-ink-mute dark:text-paper-mute">
            Чтобы подобрать запчасти по названию именно для вашей машины, сначала
            введите VIN-код.
          </p>
          <Link
            href={`/${locale}/search/vin`}
            className="btn-primary mx-auto w-full sm:w-auto"
          >
            Ввести VIN-код <ChevronRight className="h-4 w-4" />
          </Link>
          <p className="text-xs text-ink-mute dark:text-paper-mute">
            Совет:{" "}
            <Link href={`/${locale}/account`} className="underline">
              зарегистрируйтесь
            </Link>{" "}
            и добавьте все свои авто — сможете легко переключаться между ними при
            поиске и видеть историю поисков.
          </p>
        </div>
      </section>
    );
  }

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

      <SearchInputForm
        locale={locale}
        kind="name"
        voiceEnabled={voiceOn}
        sttServer={sttServer}
      />

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
