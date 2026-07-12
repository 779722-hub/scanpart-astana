import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Wrench, Car, ChevronRight, Lock } from "lucide-react";
import { LocaleSwitcher } from "./locale-switcher";
import { ThemeSwitcher } from "./theme-switcher";
import { CartButton } from "./cart-button";
import { AccountButton } from "./account-button";
import { getThemeMap, getImageSlot } from "@/lib/content";
import { cldUrl } from "@/lib/cloudinary-url";
import { getSession } from "@/lib/session";

export async function SiteHeader() {
  const locale = await getLocale();
  const t = await getTranslations("brand");
  const theme = await getThemeMap().catch(() => ({} as Record<string, string>));
  const logoText = theme.logo_text || t("name");
  const logo = await getImageSlot("logo").catch(() => null);
  const tv = await getTranslations("vehicleBar");
  const session = await getSession();
  const vehicle = session.vehicle;
  const isCustomer = Boolean(session.customer);
  const vinHref = `/${locale}/search/vin`;
  const accountHref = `/${locale}/account`;
  const btnCls =
    "inline-flex flex-none items-center gap-1 rounded-full bg-brand px-3 py-1 text-xs font-semibold text-white shadow-card transition hover:bg-brand-600 sm:text-sm";

  return (
    <header className="sticky top-0 z-40 border-b border-paper-mute/60 bg-paper/80 backdrop-blur dark:border-ink-mute/60 dark:bg-ink/80">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-2 px-3 sm:h-16 sm:gap-3 sm:px-6">
        <Link
          href={`/${locale}`}
          className="group flex min-w-0 items-center gap-2 font-bold tracking-tight"
        >
          {logo?.publicId ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={cldUrl(logo.publicId, { width: 144 })}
              alt={logo.altRu || logoText}
              className="h-8 w-auto max-w-[9rem] flex-none object-contain transition group-hover:scale-105 sm:h-9"
            />
          ) : (
            <span className="flex h-8 w-8 flex-none items-center justify-center rounded-2xl bg-brand text-white shadow-card transition group-hover:scale-105 sm:h-9 sm:w-9">
              <Wrench className="h-4 w-4" />
            </span>
          )}
          <span className="truncate text-base sm:text-xl">{logoText}</span>
        </Link>
        <div className="flex flex-none items-center gap-1.5 sm:gap-2">
          <AccountButton signedIn={isCustomer} />
          <CartButton />
          <LocaleSwitcher />
          <ThemeSwitcher />
        </div>
      </div>

      {/* current vehicle bar — mounted into the header (same colour), always
          visible so the customer knows which car they're searching for and can
          switch it in one tap */}
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 border-t border-paper-mute/50 px-3 py-1.5 text-sm sm:px-6 dark:border-ink-mute/50">
        {vehicle?.make ? (
          <>
            <span className="flex min-w-0 items-center gap-1.5 text-ink-mute dark:text-paper-mute">
              <Car className="h-4 w-4 flex-none text-brand" />
              <span className="flex-none">{tv("searchingFor")}</span>
              <strong className="truncate text-ink dark:text-paper">
                {vehicle.make}
                {vehicle.model && vehicle.model !== "—" ? ` ${vehicle.model}` : ""}
                {vehicle.year && vehicle.year !== "—" ? ` ${vehicle.year}` : ""}
              </strong>
            </span>
            {isCustomer ? (
              <Link href={vinHref} className={btnCls}>
                {tv("changeCar")}
                <ChevronRight className="h-4 w-4" />
              </Link>
            ) : (
              // Switching cars is a cabinet feature — send guests to log in.
              <Link href={accountHref} className={btnCls}>
                <Lock className="h-3.5 w-3.5" />
                {tv("loginToChange")}
              </Link>
            )}
          </>
        ) : (
          <>
            <span className="flex min-w-0 items-center gap-1.5 text-ink-mute dark:text-paper-mute">
              <Car className="h-4 w-4 flex-none text-brand" />
              <span className="flex-none">{tv("searchingFor")}</span>
              <span className="truncate">{tv("noCarValue")}</span>
            </span>
            <Link href={vinHref} className={btnCls}>
              {tv("specifyVin")}
              <ChevronRight className="h-4 w-4" />
            </Link>
          </>
        )}
      </div>
    </header>
  );
}
