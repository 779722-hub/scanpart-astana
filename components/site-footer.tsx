import Link from "next/link";
import { Phone } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { getSetting } from "@/lib/sheets/settings";

export async function SiteFooter() {
  const locale = await getLocale();
  const t = await getTranslations("home");
  const tb = await getTranslations("brand");
  const year = new Date().getFullYear();

  const [saleOn, phone, wa, hours, footerLinksRaw] = await Promise.all([
    getSetting("sale_enabled").then((v) => v === "on").catch(() => false),
    getSetting("manager_phone_display").catch(() => ""),
    getSetting("manager_whatsapp_e164").catch(() => ""),
    getSetting("express_hours").catch(() => ""),
    getSetting("footer_links").catch(() => ""),
  ]);

  // Доп. ссылки из админки: по строке «Название | ссылка».
  const customLinks = (footerLinksRaw ?? "")
    .split("\n")
    .map((line) => {
      const [label, href] = line.split("|").map((s) => s.trim());
      return label && href ? { label, href } : null;
    })
    .filter((x): x is { label: string; href: string } => x !== null);

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
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-4 lg:grid-cols-5">
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
                <li><Link href={`/${locale}/sale`} className={linkCls}>Распродажа</Link></li>
              )}
              <li><Link href={`/${locale}/cart`} className={linkCls}>Корзина</Link></li>
            </ul>
          </nav>

          {/* Контакты */}
          <nav className="text-sm">
            <div className={headCls}>Контакты</div>
            <ul className="space-y-2">
              {phone && (
                <li>
                  <a
                    href={`tel:${phone.replace(/[^\d+]/g, "")}`}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-paper-mute px-3 py-1.5 text-ink-mute transition hover:border-ink-mute hover:text-ink dark:border-ink-mute dark:text-paper-mute dark:hover:text-paper"
                  >
                    <Phone className="h-3.5 w-3.5" /> Позвонить
                  </a>
                </li>
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

          {/* Доп. ссылки из админки. */}
          {customLinks.length > 0 && (
            <nav className="text-sm">
              <div className={headCls}>Информация</div>
              <ul className="space-y-2">
                {customLinks.map((l) =>
                  l.href.startsWith("http") ? (
                    <li key={l.href}>
                      <a href={l.href} target="_blank" rel="noreferrer" className={linkCls}>{l.label}</a>
                    </li>
                  ) : (
                    <li key={l.href}>
                      <Link href={l.href} className={linkCls}>{l.label}</Link>
                    </li>
                  )
                )}
              </ul>
            </nav>
          )}
        </div>

        <div className="mt-10 border-t border-paper-mute/60 pt-6 text-center text-sm text-ink-mute sm:text-left dark:border-ink-mute/60 dark:text-paper-mute">
          © {year} · {tb("name")} · {tb("tagline")}
        </div>
      </div>
    </footer>
  );
}
