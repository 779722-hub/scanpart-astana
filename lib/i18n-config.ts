/**
 * Pure constants — safe to import from edge runtime (middleware).
 * Importing from `i18n.ts` directly drags googleapis into the edge bundle.
 */
export const locales = ["ru", "kk", "en"] as const;
export const defaultLocale = "ru" as const;
export type Locale = (typeof locales)[number];
