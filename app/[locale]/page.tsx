import { getTranslations, unstable_setRequestLocale } from "next-intl/server";
import Link from "next/link";
import {
  Barcode,
  Hash,
  Info,
  Search,
  MapPin,
  Truck,
  Shield,
  Sparkles,
  Phone,
  Clock,
  CheckCircle2,
} from "lucide-react";
import type { Metadata } from "next";
import { getImageSlot, imageAlt } from "@/lib/content";
import { getAllSettings } from "@/lib/sheets/settings";
import { cldUrl } from "@/lib/cloudinary-url";
import { pageMetadata } from "@/lib/seo";

export function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return pageMetadata("home", locale);
}

export default async function HomePage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  unstable_setRequestLocale(locale);
  const t = await getTranslations("home");
  const [heroLight, heroDark, heroFallback, settings] = await Promise.all([
    getImageSlot("hero_light").catch(() => null),
    getImageSlot("hero_dark").catch(() => null),
    getImageSlot("hero").catch(() => null),
    getAllSettings().catch(() => null),
  ]);
  const lightUrl = heroLight?.publicId
    ? cldUrl(heroLight.publicId, { width: 1920 })
    : heroFallback?.publicId
      ? cldUrl(heroFallback.publicId, { width: 1920 })
      : null;
  const darkUrl = heroDark?.publicId
    ? cldUrl(heroDark.publicId, { width: 1920 })
    : heroFallback?.publicId
      ? cldUrl(heroFallback.publicId, { width: 1920 })
      : null;
  // Подпись берём у того слота, чья картинка реально показана в светлой теме.
  const heroAlt = imageAlt(heroLight?.publicId ? heroLight : heroFallback, locale);

  const cards = [
    {
      href: `/${locale}/search/vin`,
      label: t("btnVin"),
      desc: t("btnVinDesc"),
      Icon: Barcode,
      accent: "bg-brand text-white",
    },
    {
      href: `/${locale}/search/article`,
      label: t("btnArticle"),
      desc: t("btnArticleDesc"),
      Icon: Hash,
      accent: "bg-ink text-white dark:bg-paper dark:text-ink",
    },
    {
      href: `/${locale}/search/name`,
      label: t("btnName"),
      desc: t("btnNameDesc"),
      Icon: Search,
      accent: "bg-brand-600 text-white",
    },
    {
      href: `/${locale}/info`,
      label: t("btnInfo"),
      desc: t("btnInfoDesc"),
      Icon: Info,
      accent: "bg-paper-soft text-ink dark:bg-ink-mute dark:text-paper",
    },
  ];

  const features = [
    {
      Icon: MapPin,
      title: "100% наличие в Астане",
      text: "Показываем то, что физически на полке — без обещаний доставки из других городов.",
    },
    {
      Icon: Shield,
      title: "По оригинальному номеру",
      text: "Мы подберём проверенные аналоги от надёжных производителей.",
    },
    {
      // Про экспресс-доставку рассказано ниже, рядом с самовывозом — здесь
      // о том, ради чего сервис вообще нужен.
      Icon: Sparkles,
      title: "Автоматический поиск",
      text: "Самый удобный подбор запчастей — без знания технических особенностей и каталогов.",
    },
  ];

  const steps = [
    { n: 1, text: "Введите VIN, парт-номер или название запчасти" },
    { n: 2, text: "Получите цены и наличие со склада в Астане" },
    { n: 3, text: "Добавьте в корзину и оформите заказ" },
    { n: 4, text: "Менеджер свяжется с вами для подтверждения и оплаты" },
    { n: 5, text: "Самовывоз на следующий день или экспресс-доставка нашим курьером" },
  ];

  return (
    <div className="relative isolate">
      {/* hero — two layers, switched by .dark class.
          Светлый — настоящий <img>: CSS-фон в поиск по картинкам не попадает
          (у фона нет alt) и грузится поздно, уже после разбора стилей.
          Тёмный намеренно остался фоном: скрытый <img> браузер всё равно
          качает, а фон под display:none — нет. Так светлая тема (и Googlebot,
          он рендерит светлую) не платит за тёмную картинку. */}
      {lightUrl ? (
        <div className="absolute inset-x-0 top-0 -z-10 h-[64vh] overflow-hidden sm:h-[82vh] dark:hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightUrl}
            alt={heroAlt}
            width={1920}
            height={1080}
            fetchPriority="high"
            decoding="async"
            className="h-full w-full object-cover object-center"
          />
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              backgroundImage:
                "linear-gradient(180deg, rgba(248,249,251,0) 0%, rgba(248,249,251,0.15) 45%, rgba(248,249,251,0.75) 80%, rgba(248,249,251,1) 100%)",
            }}
          />
        </div>
      ) : (
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 -z-10 h-[64vh] sm:h-[82vh] bg-hero-day dark:hidden"
        />
      )}
      {darkUrl ? (
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 -z-10 hidden h-[64vh] sm:h-[82vh] bg-cover bg-center dark:block"
          style={{
            backgroundImage: `linear-gradient(180deg, rgba(11,13,16,0.35) 0%, rgba(11,13,16,0.55) 45%, rgba(11,13,16,0.85) 80%, rgba(11,13,16,1) 100%), url(${darkUrl})`,
          }}
        />
      ) : (
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 -z-10 hidden h-[64vh] sm:h-[82vh] bg-hero-night dark:block"
        />
      )}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 [mask-image:radial-gradient(70%_50%_at_50%_0%,#000,transparent)] bg-[url('/images/hero-grid.svg')] opacity-30"
      />

      {/* HERO */}
      <section className="mx-auto max-w-6xl px-4 pb-6 pt-4 sm:px-6 sm:pb-8 sm:pt-10">
        <div className="inline-block rounded-3xl bg-white/80 px-5 py-4 shadow-card backdrop-blur-md sm:px-8 sm:py-6 dark:bg-ink/70 dark:shadow-cardHover">
          <h1 className="text-balance text-3xl font-bold tracking-tight text-ink sm:text-5xl md:text-6xl dark:text-paper">
            {t("title")}
          </h1>
          <p className="mt-3 max-w-2xl text-pretty text-base text-ink-mute sm:mt-4 sm:text-lg dark:text-paper-mute">
            {t("subtitle")}
          </p>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:mt-10 sm:gap-4 lg:grid-cols-4">
          {cards.map(({ href, label, desc, Icon, accent }) => (
            <Link
              key={href}
              href={href}
              className="card neon-hover group flex min-h-[7.5rem] flex-col justify-between transition hover:-translate-y-0.5 sm:min-h-[10rem]"
            >
              <span
                className={`flex h-10 w-10 items-center justify-center rounded-2xl shadow-card sm:h-12 sm:w-12 ${accent}`}
              >
                <Icon className="h-5 w-5 sm:h-6 sm:w-6" />
              </span>
              <div className="mt-4 sm:mt-6">
                <div className="text-base font-bold leading-tight sm:text-xl">
                  {label}
                </div>
                <div className="mt-1 hidden text-sm text-ink-mute sm:block dark:text-paper-mute">
                  {desc}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Как это работает
        </h2>
        {/* 5 шагов: в 4 колонки последний уезжал в отдельный ряд один */}
        <ol className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {steps.map((s) => (
            <li key={s.n} className="card flex items-start gap-3">
              <span className="flex h-9 w-9 flex-none items-center justify-center rounded-2xl bg-brand text-base font-bold text-white">
                {s.n}
              </span>
              <p className="text-sm leading-snug">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* FEATURES */}
      <section className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Почему мы
        </h2>
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {features.map(({ Icon, title, text }) => (
            <div key={title} className="card">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand/10 text-brand">
                <Icon className="h-6 w-6" />
              </span>
              <h3 className="mt-4 text-lg font-bold">{title}</h3>
              <p className="mt-2 text-sm text-ink-mute dark:text-paper-mute">
                {text}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* CONTACT / DELIVERY */}
      <section className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="card space-y-3">
            <div className="flex items-center gap-2 text-brand">
              <Truck className="h-5 w-5" />
              <h3 className="text-lg font-bold">Экспресс-доставка</h3>
            </div>
            <p className="text-base font-bold text-ink dark:text-paper">
              От 2 до 4 часов по Астане ·{" "}
              <span className="text-brand">
                {settings?.expressDeliveryPrice ?? 4000} ₸
              </span>
            </p>
            <ul className="space-y-2 text-sm">
              <li className="flex items-start gap-2">
                <Clock className="mt-0.5 h-4 w-4 flex-none text-ink-mute dark:text-paper-mute" />
                Время заказа: {settings?.expressHours ?? "Пн–Сб 09:00–16:00"}
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none text-emerald-600" />
                Курьер по всем районам Астаны
              </li>
            </ul>
          </div>

          <div className="card space-y-3">
            <div className="flex items-center gap-2 text-brand">
              <MapPin className="h-5 w-5" />
              <h3 className="text-lg font-bold">Самовывоз</h3>
            </div>
            <ul className="space-y-2 text-sm">
              <li className="flex items-start gap-2">
                <MapPin className="mt-0.5 h-4 w-4 flex-none text-ink-mute dark:text-paper-mute" />
                {settings?.pickupAddress ?? "г. Астана, пр. Республики, 68"}
              </li>
              <li className="flex items-start gap-2">
                <Clock className="mt-0.5 h-4 w-4 flex-none text-ink-mute dark:text-paper-mute" />
                Заберёте {settings?.pickupHours ?? "завтра 14:00–18:00"}
              </li>
              {settings?.managerPhoneDisplay && (
                <li className="flex items-start gap-2">
                  <Phone className="mt-0.5 h-4 w-4 flex-none text-ink-mute dark:text-paper-mute" />
                  <a
                    href={`tel:${settings.managerPhoneDisplay.replace(/\D/g, "")}`}
                    className="font-semibold underline"
                  >
                    {settings.managerPhoneDisplay}
                  </a>
                </li>
              )}
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
