import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { getSetting } from "@/lib/sheets/settings";

export async function SiteFooter() {
  const locale = await getLocale();
  const t = await getTranslations("home");
  const tb = await getTranslations("brand");
  const year = new Date().getFullYear();

  const [saleOn, phone, wa, hours] = await Promise.all([
    getSetting("sale_enabled").then((v) => v === "on").catch(() => false),
    getSetting("manager_phone_display").catch(() => ""),
    getSetting("manager_whatsapp_e164").catch(() => ""),
    getSetting("express_hours").catch(() => ""),
  ]);

  const linkCls =
    "text-ink-mute transition hover:text-brand dark:text-paper-mute dark:hover:text-brand";
  const headCls = "mb-3 text-xs font-bold uppercase tracking-wider text-ink dark:text-paper";

  return (
    <footer className="relative mt-12 overflow-hidden border-t border-paper-mute/60 bg-paper-soft sm:mt-20 dark:border-ink-mute/60 dark:bg-ink-soft">
      {/* Крупная светло-серая надпись на фоне. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center">
        <span className="select-none whitespace-nowrap text-[22vw] font-black leading-[0.8] tracking-tighter text-ink/[0.05] dark:text-paper/[0.05]">
          SCANPART
        </span>
      </div>

      <div className="relative mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-12">
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
          {/* Бренд */}
          <div className="col-span-2 sm:col-span-1">
            <div className="text-lg font-bold tracking-tight text-ink dark:text-paper">
              {tb("name")}
            </div>
            <p className="mt-2 text-sm text-ink-mute dark:text-paper-mute">{tb("tagline")}</p>
          </div>

          {/* Поиск */}
          <nav className="text-sm">
            <div className={headCls}>Поиск</div>
            <ul className="space-y-2">
              <li><Link href={`/${locale}/search/vin`} className={linkCls}>{t("btnVin")}</Link></li>
              <li><Link href={`/${locale}/search/article`} className={linkCls}>{t("btnArticle")}</Link></li>
              <li><Link href={`/${locale}/search/name`} className={linkCls}>{t("btnName")}</Link></li>
            </ul>
          </nav>

          {/* Сервис */}
          <nav className="text-sm">
            <div className={headCls}>Сервис</div>
            <ul className="space-y-2">
              <li><Link href={`/${locale}/info`} className={linkCls}>{t("btnInfo")}</Link></li>
              {saleOn && (
                <li><Link href={`/${locale}/sale`} className="font-semibold text-brand transition hover:text-brand-600">Распродажа</Link></li>
              )}
              <li><Link href={`/${locale}/cart`} className={linkCls}>Корзина</Link></li>
            </ul>
          </nav>

          {/* Контакты */}
          <nav className="text-sm">
            <div className={headCls}>Контакты</div>
            <ul className="space-y-2">
              {phone && (
                <li><a href={`tel:${phone.replace(/[^\d+]/g, "")}`} className={linkCls}>{phone}</a></li>
              )}
              {wa && (
                <li>
                  <a href={`https://wa.me/${wa.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="text-emerald-600 transition hover:text-emerald-500">
                    WhatsApp
                  </a>
                </li>
              )}
              {hours && <li className="text-ink-mute dark:text-paper-mute">{hours}</li>}
              <li className="text-ink-mute dark:text-paper-mute">Астана</li>
            </ul>
          </nav>
        </div>

        <div className="mt-10 border-t border-paper-mute/60 pt-6 text-center text-sm text-ink-mute sm:text-left dark:border-ink-mute/60 dark:text-paper-mute">
          © {year} · {tb("name")} · {tb("tagline")}
        </div>
      </div>
    </footer>
  );
}
