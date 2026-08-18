import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { AlertTriangle } from "lucide-react";
import { getSetting } from "@/lib/sheets/settings";

/**
 * Полоса-предупреждение для покупателя, когда KZ-прокси лежит и поиск не работает.
 * Значение `proxy_status` ведёт крон /api/cron/proxy-check ("up"/"down") — читаем
 * кэшированным getSetting (60с), без живой проверки прокси на каждый запрос, так
 * что латентность витрины не растёт. Показываем только при "down"; на "up"/пусто
 * и на страницах админки (там свой индикатор) — ничего не рендерим.
 */
export async function ProxyBanner() {
  const pathname = headers().get("x-pathname") ?? "";
  if (/\/admin(\/|$)/.test(pathname)) return null;

  const status = (await getSetting("proxy_status").catch(() => undefined))?.trim();
  if (status !== "down") return null;

  const t = await getTranslations("proxyBanner");
  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 border-b border-amber-300 bg-amber-50 px-3 py-2 text-center text-sm font-medium text-amber-900 dark:border-amber-700/60 dark:bg-amber-900/20 dark:text-amber-100 sm:px-6"
    >
      <AlertTriangle className="h-4 w-4 flex-none" aria-hidden />
      <span>{t("down")}</span>
    </div>
  );
}
