import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Car, ChevronRight } from "lucide-react";
import { LocaleSwitcher } from "./locale-switcher";
import { CartButton } from "./cart-button";
import { AccountButton } from "./account-button";
import { BrandLink } from "./brand-link";
import { getThemeMap, getImageSlot } from "@/lib/content";
import { cldUrl } from "@/lib/cloudinary-url";
import { getSession } from "@/lib/session";

export async function SiteHeader() {
  const locale = await getLocale();
  const t = await getTranslations("brand");
  const theme = await getThemeMap().catch(() => ({} as Record<string, string>));
  const logoText = theme.logo_text || t("name");
  // Mobile shows only the first word (before the dot), enlarged; desktop keeps
  // the full name.
  const logoShort = logoText.split(".")[0].trim() || logoText;
  const logo = await getImageSlot("logo").catch(() => null);
  const tv = await getTranslations("vehicleBar");
  const session = await getSession();
  const vehicle = session.vehicle;
  const isCustomer = Boolean(session.customer);
  const vinHref = `/${locale}/search/vin`;
  const btnCls =
    "inline-flex min-h-[36px] flex-none items-center gap-1 rounded-2xl bg-brand px-3 py-1 text-xs font-semibold text-white transition hover:bg-brand-600 sm:min-h-0 sm:text-sm";

  return (
    <header className="sticky top-0 z-40 border-b border-paper-mute/60 bg-paper/80 backdrop-blur dark:border-ink-mute/60 dark:bg-ink/80">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-2 px-3 sm:h-16 sm:gap-3 sm:px-6">
        <BrandLink
          locale={locale}
          className="group flex min-w-0 items-center gap-1.5 font-bold tracking-tight sm:gap-2"
        >
          {logo?.publicId ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={cldUrl(logo.publicId, { width: 144 })}
              alt={logo.altRu || logoText}
              className="h-8 w-auto max-w-[6rem] flex-none object-contain transition group-hover:scale-105 sm:h-9 sm:max-w-[9rem]"
            />
          ) : (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src="/icon-192.png"
              alt={logoText}
              className="h-8 w-8 flex-none rounded-2xl object-cover shadow-card transition group-hover:scale-105 sm:h-9 sm:w-9"
            />
          )}
          <span className="truncate text-xl sm:hidden">{logoShort}</span>
          <span className="hidden truncate sm:block sm:text-xl">{logoText}</span>
        </BrandLink>
        <div className="flex flex-none items-center gap-1 sm:gap-2">
          <LocaleSwitcher />
          <CartButton />
          <AccountButton signedIn={isCustomer} />
        </div>
      </div>

      {/* current vehicle bar — mounted into the header (same colour), always
          visible so the customer knows which car they're searching for and can
          switch it in one tap. Без подписи: машина и так читается по значку,
          а лишнее слово ело ширину на телефоне. Значок — в высоту логотипа. */}
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 border-t border-paper-mute/50 px-3 py-1.5 text-sm sm:px-6 dark:border-ink-mute/50">
        {vehicle?.make ? (
          <>
            <span className="flex min-w-0 items-center gap-2 text-ink-mute dark:text-paper-mute">
              {/* −20% от высоты логотипа: 32→26, 36→29 */}
              <Car className="h-[26px] w-[26px] flex-none text-brand sm:h-[29px] sm:w-[29px]" aria-hidden />
              <strong className="truncate text-sm font-semibold tracking-tight text-ink sm:text-base dark:text-paper">
                {vehicle.make}
                {vehicle.model && vehicle.model !== "—" ? ` ${vehicle.model}` : ""}
                {vehicle.year && vehicle.year !== "—" ? ` ${vehicle.year}` : ""}
              </strong>
            </span>
            <Link href={vinHref} className={btnCls}>
              {tv("changeCar")}
              <ChevronRight className="h-4 w-4" />
            </Link>
          </>
        ) : (
          <>
            <span className="flex min-w-0 items-center gap-2 text-ink-mute dark:text-paper-mute">
              {/* −20% от высоты логотипа: 32→26, 36→29 */}
              <Car className="h-[26px] w-[26px] flex-none text-brand sm:h-[29px] sm:w-[29px]" aria-hidden />
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
