import { getRequestConfig } from "next-intl/server";
import { notFound } from "next/navigation";
import type { AbstractIntlMessages } from "next-intl";
import { deepMerge, getOverridesForLocale } from "@/lib/content";
import { locales, type Locale } from "@/lib/i18n-config";

export { locales, defaultLocale, type Locale } from "@/lib/i18n-config";

export default getRequestConfig(async ({ locale }) => {
  if (!locales.includes(locale as Locale)) notFound();

  const baseline = (await import(`./messages/${locale}.json`))
    .default as Record<string, unknown>;
  const overrides = await getOverridesForLocale(locale as Locale).catch(
    () => ({} as Record<string, unknown>)
  );
  const messages = deepMerge(baseline, overrides) as AbstractIntlMessages;

  return {
    messages,
    timeZone: "Asia/Almaty",
    now: new Date(),
  };
});
