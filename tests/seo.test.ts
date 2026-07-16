import { test } from "node:test";
import assert from "node:assert/strict";
import { PAGE_PATH, pageMetadata, noindexMetadata, type PageKey } from "../lib/seo";
import { LOCALES, SITE_URL } from "../lib/site";

/**
 * Эти проверки существуют потому, что сайт УЖЕ доезжал до прода сломанным, и
 * никто этого не замечал месяцами:
 *  - главная затирала og:image, и ссылка в мессенджер приходила без картинки;
 *  - все публичные страницы отдавали один и тот же заголовок;
 *  - canonical и hreflang были только на главной.
 *
 * Тест ловит ровно эти регрессии до выката. Он не ходит в сеть: картинку из
 * админки без ключей Sheets не получить, поэтому og:image проверяется только
 * на то, что объект openGraph собран целиком, а не заменён огрызком.
 */

const PAGES = Object.keys(PAGE_PATH) as PageKey[];

test("у каждой публичной страницы свой заголовок — они не дублируются", async () => {
  for (const locale of LOCALES) {
    const titles = await Promise.all(
      PAGES.map(async (p) => (await pageMetadata(p, locale)).title as string)
    );
    const unique = new Set(titles);
    assert.equal(
      unique.size,
      titles.length,
      `[${locale}] заголовки дублируются: ${titles.join(" | ")}`
    );
  }
});

test("заголовок не длиннее 70 знаков и не задваивает имя сайта", async () => {
  for (const locale of LOCALES) {
    for (const p of PAGES) {
      const title = (await pageMetadata(p, locale)).title as string;
      assert.ok(title.length <= 70, `[${locale}/${p}] заголовок ${title.length} знаков: ${title}`);
      const hits = title.match(/SCANPART/gi) ?? [];
      assert.equal(hits.length, 1, `[${locale}/${p}] имя сайта повторяется: ${title}`);
    }
  }
});

test("описание задано и не длиннее 180 знаков", async () => {
  for (const locale of LOCALES) {
    for (const p of PAGES) {
      const d = (await pageMetadata(p, locale)).description;
      assert.ok(d && d.length > 40, `[${locale}/${p}] описание пустое или куцее`);
      assert.ok(d.length <= 180, `[${locale}/${p}] описание ${d.length} знаков`);
    }
  }
});

test("canonical есть на каждой странице и ведёт на её же адрес", async () => {
  for (const locale of LOCALES) {
    for (const p of PAGES) {
      const m = await pageMetadata(p, locale);
      assert.equal(
        m.alternates?.canonical,
        `${SITE_URL}/${locale}${PAGE_PATH[p]}`,
        `[${locale}/${p}] canonical неверный`
      );
    }
  }
});

test("hreflang есть на каждой странице: три языка + x-default", async () => {
  for (const locale of LOCALES) {
    for (const p of PAGES) {
      const langs = (await pageMetadata(p, locale)).alternates?.languages as
        | Record<string, string>
        | undefined;
      assert.ok(langs, `[${locale}/${p}] hreflang отсутствует`);
      for (const l of LOCALES) {
        assert.equal(langs[l], `${SITE_URL}/${l}${PAGE_PATH[p]}`, `[${locale}/${p}] hreflang ${l}`);
      }
      assert.ok(langs["x-default"], `[${locale}/${p}] нет x-default`);
    }
  }
});

test("openGraph собран целиком — иначе ссылка теряет картинку в мессенджерах", async () => {
  // Именно так и сломалась главная: `openGraph: { url }` заменял родительский
  // объект целиком, и og:image исчезал.
  for (const locale of LOCALES) {
    for (const p of PAGES) {
      const og = (await pageMetadata(p, locale)).openGraph as
        | Record<string, unknown>
        | undefined;
      assert.ok(og, `[${locale}/${p}] openGraph отсутствует`);
      for (const field of ["type", "siteName", "locale", "url", "title", "description"]) {
        assert.ok(og[field], `[${locale}/${p}] в openGraph нет ${field}`);
      }
      assert.ok("images" in og, `[${locale}/${p}] в openGraph нет ключа images`);
    }
  }
});

test("приватные страницы помечены noindex", () => {
  const m = noindexMetadata("Корзина");
  assert.equal(m.robots && (m.robots as { index: boolean }).index, false);
  const admin = noindexMetadata("Панель", false);
  assert.equal(admin.robots && (admin.robots as { follow: boolean }).follow, false);
});

test("sitemap и метаданные берут пути из одного источника", async () => {
  // Разъедутся — и карта сайта начнёт отдавать адреса, которых нет.
  const { default: sitemap } = await import("../app/sitemap");
  const urls = sitemap().map((e) => e.url);
  for (const locale of LOCALES) {
    for (const p of PAGES) {
      const want = `${SITE_URL}/${locale}${PAGE_PATH[p]}`;
      assert.ok(urls.includes(want), `в sitemap нет ${want}`);
    }
  }
  assert.equal(new Set(urls).size, urls.length, "в sitemap есть дубли адресов");
});
