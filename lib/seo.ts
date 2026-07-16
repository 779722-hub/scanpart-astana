import type { Metadata } from "next";
import { getImageSlot, imageAlt } from "@/lib/content";
import { cldUrl } from "@/lib/cloudinary-url";
import {
  SITE_URL,
  SITE_NAME,
  LOCALES,
  DEFAULT_LOCALE,
  OG_LOCALE,
  seoFor,
  type SeoLocale,
} from "@/lib/site";

/**
 * Метаданные страниц. Раньше их задавал только layout, поэтому все публичные
 * страницы отдавали ОДИН заголовок и описание и конкурировали друг с другом,
 * а canonical и hreflang были лишь на главной.
 *
 * Здесь собрано всё в одном месте: у каждой страницы свой заголовок, свой
 * canonical и полный набор hreflang.
 *
 * Про Open Graph: Next НЕ сливает openGraph страницы с родительским — он его
 * заменяет целиком. Главная задавала `openGraph: { url }` и тем самым стирала
 * og:image, из-за чего ссылка на scanpart.kz приходила в мессенджер без
 * картинки. Поэтому здесь openGraph всегда собирается полностью.
 */
export type PageKey = "home" | "vin" | "article" | "name" | "info";

/** Путь страницы внутри локали. Он же — источник правды для sitemap. */
export const PAGE_PATH: Record<PageKey, string> = {
  home: "",
  vin: "/search/vin",
  article: "/search/article",
  name: "/search/name",
  info: "/info",
};

interface PageCopy {
  title: string;
  description: string;
}

/**
 * Заголовки под регион: Астана в каждом, потому что основной спрос местный.
 * Длина title до ~60 знаков вместе с « · SCANPART.ASTANA», description до ~160
 * — дальше выдача обрезает.
 */
const PAGE_SEO: Record<SeoLocale, Record<PageKey, PageCopy>> = {
  ru: {
    home: {
      title: "Автозапчасти в Астане — поиск по VIN",
      description:
        "Поиск автозапчастей в Астане по VIN, парт-номеру и названию. Наличие на складе в Астане, оригинал и проверенные аналоги, цена сразу, доставка 2–4 часа и самовывоз.",
    },
    vin: {
      title: "Подбор запчастей по VIN в Астане",
      description:
        "Введите VIN — откроем каталог завода и покажем детали для вашей комплектации. Можно сфотографировать техпаспорт: VIN распознается сам. Наличие и цена по складу в Астане.",
    },
    article: {
      title: "Поиск запчастей по парт-номеру в Астане",
      description:
        "Знаете номер детали — введите его. Покажем оригинал и проверенные аналоги, которые есть на складе в Астане, с ценой и количеством. Если номер не для вашего авто — предупредим.",
    },
    name: {
      title: "Запчасти по названию в Астане, голосом",
      description:
        "Напишите «передние колодки» или скажите голосом. Подбираем по каталогу вашего авто, а не наугад. Наличие на складе в Астане, оригинал и аналоги, цена сразу.",
    },
    info: {
      title: "Как работает подбор запчастей в Астане",
      description:
        "Четыре способа найти запчасть: по VIN, по фото техпаспорта, по парт-номеру и по названию голосом. Что видно в ответе, как устроены доставка по Астане и самовывоз.",
    },
  },
  kk: {
    home: {
      title: "Астанада автобөлшектер — VIN бойынша",
      description:
        "Астанада автобөлшектерді VIN, парт-нөмір және атау бойынша іздеу. Астана қоймасында бар, түпнұсқа және тексерілген аналогтар, бағасы бірден, 2–4 сағатта жеткізу.",
    },
    vin: {
      title: "Астанада VIN бойынша бөлшектерді таңдау",
      description:
        "VIN енгізіңіз — зауыт каталогын ашып, жинақтамаңызға арналған бөлшектерді көрсетеміз. Техпаспортты суретке түсіруге болады: VIN өзі танылады. Астана қоймасындағы баға мен қалдық.",
    },
    article: {
      title: "Астанада парт-нөмір бойынша бөлшектерді іздеу",
      description:
        "Бөлшектің нөмірін білсеңіз — енгізіңіз. Астана қоймасында бар түпнұсқа мен тексерілген аналогтарды бағасы және санымен көрсетеміз.",
    },
    name: {
      title: "Астанада атауы бойынша бөлшектер",
      description:
        "«Алдыңғы тежегіш қалыптары» деп жазыңыз немесе дауыстап айтыңыз. Кездейсоқ емес, көлігіңіздің каталогы бойынша таңдаймыз. Астана қоймасындағы қалдық пен баға.",
    },
    info: {
      title: "Астанада бөлшектерді таңдау қалай жұмыс істейді",
      description:
        "Бөлшекті табудың төрт тәсілі: VIN бойынша, техпаспорт фотосы бойынша, парт-нөмір және атауы бойынша дауыспен. Астана бойынша жеткізу мен өзі алып кету қалай ұйымдастырылған.",
    },
  },
  en: {
    home: {
      title: "Car parts in Astana — search by VIN",
      description:
        "Car-parts search in Astana by VIN, part number and name. In stock at the Astana warehouse, OEM and proven analogs, instant pricing, delivery in 2–4 hours and pickup.",
    },
    vin: {
      title: "Find car parts by VIN in Astana",
      description:
        "Enter a VIN — we open the manufacturer catalog and show parts for your exact build. You can photograph the registration: the VIN is read automatically. Stock and price in Astana.",
    },
    article: {
      title: "Search car parts by part number in Astana",
      description:
        "Know the part number? Enter it. We show the original and proven analogs in stock at the Astana warehouse, with price and quantity, and warn if it does not fit your car.",
    },
    name: {
      title: "Car parts by name in Astana, by voice",
      description:
        "Type “front brake pads” or just say it. We match against your car's catalog, not by guessing. Stock at the Astana warehouse, original and analogs, instant pricing.",
    },
    info: {
      title: "How car-parts matching works in Astana",
      description:
        "Four ways to find a part: by VIN, by a photo of your registration, by part number and by name using voice. What the answer shows, how delivery in Astana and pickup work.",
    },
  },
};

function localeOf(locale: string): SeoLocale {
  return (LOCALES as readonly string[]).includes(locale)
    ? (locale as SeoLocale)
    : DEFAULT_LOCALE;
}

/** hreflang для всех локалей + x-default на язык по умолчанию. */
function languagesFor(path: string): Record<string, string> {
  const map: Record<string, string> = {};
  for (const l of LOCALES) map[l] = `${SITE_URL}/${l}${path}`;
  map["x-default"] = `${SITE_URL}/${DEFAULT_LOCALE}${path}`;
  return map;
}

/**
 * Полный набор метаданных публичной страницы: свой заголовок, canonical,
 * hreflang, OG с картинкой и Twitter.
 */
export async function pageMetadata(
  page: PageKey,
  locale: string
): Promise<Metadata> {
  const l = localeOf(locale);
  const copy = PAGE_SEO[l][page];
  const path = PAGE_PATH[page];
  const url = `${SITE_URL}/${l}${path}`;
  const fullTitle = `${copy.title} · ${SITE_NAME}`;

  const og = await getImageSlot("og-default").catch(() => null);
  const images = og?.publicId
    ? [
        {
          url: cldUrl(og.publicId, { width: 1200 }),
          width: 1200,
          height: 630,
          alt: imageAlt(og, l) || copy.title,
        },
      ]
    : undefined;

  return {
    title: fullTitle,
    description: copy.description,
    keywords: seoFor(l).keywords,
    alternates: { canonical: url, languages: languagesFor(path) },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      locale: OG_LOCALE[l],
      url,
      title: fullTitle,
      description: copy.description,
      images,
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description: copy.description,
      images: images?.map((i) => i.url),
    },
  };
}

/**
 * Страницы, которых не должно быть в поиске: корзина, оформление, кабинет,
 * выдача, админка, приложение курьера.
 *
 * Именно noindex, а не Disallow в robots.txt: Disallow запрещает заходить, но
 * не запрещает показывать адрес в выдаче — и заодно мешает роботу увидеть сам
 * noindex. Поэтому такие страницы оставлены сканируемыми и помечены здесь.
 *
 * `follow` оставляем: пусть ссылки со страницы работают (например, из выдачи
 * на карточки товара).
 */
export function noindexMetadata(title: string, follow = true): Metadata {
  return {
    title: `${title} · ${SITE_NAME}`,
    robots: { index: false, follow, googleBot: { index: false, follow } },
  };
}
