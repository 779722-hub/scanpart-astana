"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Loader2, Package, Truck, Store, Check, HelpCircle, Info, Clock } from "lucide-react";
import type { PartOffer, RelaxLevel } from "@/lib/phaeton/types";

type State =
  | { kind: "loading" }
  | { kind: "empty" }
  | { kind: "error"; message?: string }
  | { kind: "ok"; offers: PartOffer[]; level: RelaxLevel };

function formatKzt(n: number): string {
  return new Intl.NumberFormat("ru-RU").format(n);
}

export function ResultsList({
  locale,
  q,
  strict = false,
  kind = "article",
}: {
  locale: string;
  q: string;
  strict?: boolean;
  kind?: "article" | "name";
}) {
  const t = useTranslations("results");
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const params = new URLSearchParams({ q, k: kind });
        if (strict) params.set("strict", "1");
        const res = await fetch(`/api/search?${params.toString()}`);
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok || !json.ok) {
          setState({ kind: "error" });
          return;
        }
        if (json.empty || !json.offers?.length) {
          setState({ kind: "empty" });
          return;
        }
        setState({
          kind: "ok",
          offers: json.offers as PartOffer[],
          level: (json.level as RelaxLevel) ?? "exact",
        });
      } catch {
        if (!cancelled) setState({ kind: "error" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [q, strict, kind]);

  if (state.kind === "loading") {
    return (
      <div className="card flex items-center justify-center gap-3 py-12 text-ink-mute dark:text-paper-mute">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>…</span>
      </div>
    );
  }

  if (state.kind === "empty") {
    return (
      <div className="card space-y-5 text-center">
        <Package className="mx-auto h-12 w-12 text-ink-mute" />
        <p className="text-lg">{t("empty")}</p>
        <Link href={`/${locale}`} className="btn-primary inline-flex">
          {t("newSearch")}
        </Link>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="card space-y-4 text-center">
        <p className="text-lg">Сервис временно недоступен.</p>
        <Link href={`/${locale}`} className="btn-secondary inline-flex">
          {t("newSearch")}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {state.level !== "exact" && <RelaxBanner level={state.level} />}
      {state.offers.map((o, i) => (
        <OfferCard key={o.id} offer={o} index={i} locale={locale} />
      ))}
      <div className="pt-2 text-center">
        <Link href={`/${locale}`} className="btn-secondary inline-flex">
          {t("newSearch")}
        </Link>
      </div>
    </div>
  );
}

function RelaxBanner({ level }: { level: RelaxLevel }) {
  const messages: Record<Exclude<RelaxLevel, "exact">, string> = {
    "no-make": "Точных совпадений с вашей маркой нет — показаны другие варианты в наличии в Астане.",
    "no-words": "По вашему запросу совпадений в Астане нет — показаны похожие позиции, которые есть в наличии.",
    "with-delivery": "В наличии Астана нет — показаны позиции с доставкой из других городов (срок указан в карточке).",
    "any-warehouse": "В Астане нет — показаны позиции с других складов (доставка может занять несколько дней).",
  };
  return (
    <div className="card flex items-start gap-3 border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-900/10">
      <Info className="mt-0.5 h-5 w-5 flex-none text-amber-600" />
      <p className="text-sm text-amber-900 dark:text-amber-200">
        {messages[level as Exclude<RelaxLevel, "exact">]}
      </p>
    </div>
  );
}

function OfferCard({
  offer,
  index,
  locale,
}: {
  offer: PartOffer;
  index: number;
  locale: string;
}) {
  const t = useTranslations("results");
  const base = `/${locale}/order`;
  const q = new URLSearchParams({
    brand: offer.brand,
    article: offer.article,
    name: offer.name,
    price: String(offer.priceFinal),
    qty: "1",
    available: String(offer.quantity),
  }).toString();

  return (
    <article className="card">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span
          className={`chip ${
            offer.isOriginal
              ? "bg-brand/10 text-brand"
              : "bg-paper-soft text-ink dark:bg-ink-mute dark:text-paper"
          }`}
        >
          {offer.isOriginal ? t("badgeOriginal") : t("badgeAnalog")}
        </span>
        <span className="chip bg-paper-soft text-ink-mute dark:bg-ink-mute dark:text-paper-mute">
          #{index + 1}
        </span>
        {offer.compat === "match" ? (
          <span
            className="chip bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
            title={offer.compatReason}
          >
            <Check className="h-3 w-3" />
            {t("badgeCompat")}
          </span>
        ) : offer.compat === "unknown" ? (
          <span
            className="chip bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
            title={offer.compatReason || t("badgeCompatUnknownHint")}
          >
            <HelpCircle className="h-3 w-3" />
            {t("badgeCompatUnknown")}
          </span>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto] sm:items-end sm:gap-4">
        <div>
          <h3 className="text-base font-bold leading-tight sm:text-xl">{offer.name}</h3>
          <dl className="mt-2 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="text-ink-mute dark:text-paper-mute">{t("brand")}</dt>
            <dd className="font-semibold">{offer.brand}</dd>
            <dt className="text-ink-mute dark:text-paper-mute">
              {t("article")}
            </dt>
            <dd className="font-mono font-semibold">{offer.article}</dd>
            <dt className="text-ink-mute dark:text-paper-mute">{t("stock")}</dt>
            <dd className="font-semibold">
              {offer.quantity} {t("stockSuffix")}
              {offer.warehouse && offer.warehouse !== "Астана" && (
                <span className="ml-1 text-xs text-ink-mute dark:text-paper-mute">
                  · {offer.warehouse}
                </span>
              )}
            </dd>
            {offer.shipmentDays > 0 && (
              <>
                <dt className="text-ink-mute dark:text-paper-mute">Доставка</dt>
                <dd className="inline-flex items-center gap-1 font-semibold text-amber-700 dark:text-amber-300">
                  <Clock className="h-3 w-3" />
                  ~{offer.shipmentDays} дн.
                </dd>
              </>
            )}
          </dl>
        </div>
        <div className="flex items-baseline justify-between gap-2 sm:block sm:text-right">
          <div className="text-xs uppercase tracking-wider text-ink-mute dark:text-paper-mute">
            {t("price")}
          </div>
          <div className="text-2xl font-black text-brand sm:text-3xl">
            {formatKzt(offer.priceFinal)}
            <span className="ml-1 text-sm font-semibold text-ink sm:text-base dark:text-paper">
              {t("priceUnit")}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        <Link href={`${base}/express?${q}`} className="btn-primary flex-1">
          <Truck className="h-4 w-4" />
          {t("orderExpress")}
        </Link>
        <Link href={`${base}/pickup?${q}`} className="btn-secondary flex-1">
          <Store className="h-4 w-4" />
          {t("orderPickup")}
        </Link>
      </div>
    </article>
  );
}
