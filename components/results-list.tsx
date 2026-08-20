"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  Loader2,
  Package,
  Check,
  CheckCircle2,
  HelpCircle,
  Info,
  Clock,
  ShoppingCart,
  Trash2,
  Truck,
  BookOpen,
  AlertTriangle,
} from "lucide-react";
import type { PartOffer, RelaxLevel } from "@/lib/phaeton/types";
import { partKey } from "@/lib/search/pick";
import { useCart } from "@/lib/cart";
import { PartPhotoLightbox } from "@/components/part-photo-lightbox";

interface FitWarning {
  make: string;
  model: string;
  year: string;
  level: "mismatch" | "unconfirmed";
  needsVin?: boolean;
}

type State =
  | { kind: "loading" }
  | { kind: "empty"; fit?: FitWarning | null }
  | { kind: "error"; message?: string }
  | {
      kind: "ok";
      offers: PartOffer[];
      related: PartOffer[];
      oem: string[];
      level: RelaxLevel;
      fit: FitWarning | null;
    };

function formatKzt(n: number): string {
  return new Intl.NumberFormat("ru-RU").format(n);
}

export function ResultsList({
  locale,
  q,
  strict = false,
  kind = "article",
  anyCar = false,
  loadingLabel,
  readyLabel,
}: {
  locale: string;
  q: string;
  strict?: boolean;
  kind?: "article" | "name";
  anyCar?: boolean;
  loadingLabel: string;
  readyLabel: string;
}) {
  const t = useTranslations("results");
  const [state, setState] = useState<State>({ kind: "loading" });
  const [revealed, setRevealed] = useState(false);
  const [sort, setSort] = useState<"asc" | "desc">("asc");
  // Phaeton (Р1) грузится вторым фоновым запросом и дописывается в список —
  // пока он идёт, показываем ненавязчивый индикатор «Ищем ещё предложения…».
  const [phaetonSearching, setPhaetonSearching] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setPhaetonSearching(false);
    (async () => {
      // Fast phase — Shate-M/Autotrade, returns immediately.
      let fast: {
        ok?: boolean;
        empty?: boolean;
        offers?: PartOffer[];
        related?: PartOffer[];
        oem?: string[];
        level?: RelaxLevel;
        fitWarning?: FitWarning | null;
        phaetonPending?: boolean;
      };
      try {
        const params = new URLSearchParams({ q, k: kind });
        if (strict) params.set("strict", "1");
        if (anyCar) params.set("anycar", "1");
        const res = await fetch(`/api/search?${params.toString()}`);
        fast = await res.json();
        if (cancelled) return;
        if (!res.ok || !fast.ok) {
          setState({ kind: "error" });
          return;
        }
      } catch {
        if (!cancelled) setState({ kind: "error" });
        return;
      }

      const pending = Boolean(fast.phaetonPending);
      const fastFit = (fast.fitWarning as FitWarning | null) ?? null;
      const hasFast = !fast.empty && !!fast.offers?.length;

      if (hasFast) {
        setState({
          kind: "ok",
          offers: fast.offers as PartOffer[],
          related: (fast.related as PartOffer[]) ?? [],
          oem: (fast.oem as string[]) ?? [],
          level: (fast.level as RelaxLevel) ?? "exact",
          fit: fastFit,
        });
        if (pending) setPhaetonSearching(true);
      } else if (pending) {
        // Nothing fast yet, but Phaeton may still carry it — keep the spinner
        // up instead of flashing "empty" before the background result lands.
        setState({ kind: "loading" });
      } else {
        setState({ kind: "empty", fit: fastFit });
        return;
      }

      if (!pending) return;

      // Phaeton phase — background. Additive: merge new offers, never error out.
      let ph: { ok?: boolean; offers?: PartOffer[] } | null = null;
      try {
        const pp = new URLSearchParams({ q, k: kind, phase: "phaeton" });
        if (anyCar) pp.set("anycar", "1");
        // Name search: pass the fast phase's resolved catalog OEMs so the
        // Phaeton phase prices them directly instead of re-running the slow
        // (~15s) Laximo lookup. Article search resolves from the query itself.
        if (kind === "name" && Array.isArray(fast.oem) && fast.oem.length) {
          pp.set("oems", (fast.oem as string[]).join(","));
        }
        const res = await fetch(`/api/search?${pp.toString()}`);
        ph = await res.json();
      } catch {
        ph = null;
      }
      if (cancelled) return;
      setPhaetonSearching(false);
      const incoming: PartOffer[] =
        ph && ph.ok && Array.isArray(ph.offers) ? ph.offers : [];

      setState((prev) => {
        const existing = prev.kind === "ok" ? prev.offers : [];
        const keys = new Set(existing.map(partKey));
        const merged = [...existing];
        for (const o of incoming) {
          const k = partKey(o);
          if (keys.has(k)) continue;
          keys.add(k);
          merged.push(o);
        }
        if (!merged.length) return { kind: "empty", fit: fastFit };
        if (prev.kind === "ok") return { ...prev, offers: merged };
        // We were in the "loading" bridge (empty fast + pending) — go to ok.
        return {
          kind: "ok",
          offers: merged,
          related: (fast.related as PartOffer[]) ?? [],
          oem: (fast.oem as string[]) ?? [],
          level: (fast.level as RelaxLevel) ?? "exact",
          fit: fastFit,
        };
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [q, strict, kind, anyCar]);

  if (state.kind === "loading") {
    return (
      <div className="card flex flex-col items-center justify-center gap-4 py-14 text-center">
        <span className="relative flex h-16 w-16 items-center justify-center">
          <span className="absolute inset-0 animate-ping rounded-full bg-brand/20" />
          <span className="absolute inset-2 rounded-full bg-brand/10" />
          <Loader2 className="h-9 w-9 animate-spin text-brand" />
        </span>
        <div>
          <div className="text-lg font-bold">{t("loadingTitle")}</div>
          <div className="mt-1 text-sm text-ink-mute dark:text-paper-mute">
            {t("loadingHint")}
          </div>
        </div>
      </div>
    );
  }

  if (state.kind === "empty") {
    return (
      <div className="space-y-4">
        {/* Manual car (no VIN): nothing found by name — steer to a VIN search
            instead of a dead-end, so we never guess parts for the wrong car. */}
        {state.fit?.needsVin && <FitBanner fit={state.fit} locale={locale} />}
        <div className="card space-y-5 text-center">
          <Package className="mx-auto h-12 w-12 text-ink-mute" />
          <p className="text-lg">{t("empty")}</p>
          <Link href={`/${locale}/search/${kind}`} className="btn-primary inline-flex">
            {t("newSearch")}
          </Link>
        </div>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="card space-y-4 text-center">
        <p className="text-lg">{t("errorService")}</p>
        <Link href={`/${locale}`} className="btn-secondary inline-flex">
          {t("newSearch")}
        </Link>
      </div>
    );
  }

  // Part-number names a DIFFERENT car — warn loudly and hide the parts until
  // the customer chooses to see them anyway.
  if (state.fit?.level === "mismatch" && !revealed) {
    return (
      <MismatchWarning
        locale={locale}
        vehicle={state.fit}
        onReveal={() => setRevealed(true)}
      />
    );
  }

  const sortedOffers = [...state.offers].sort((a, b) =>
    sort === "asc" ? a.priceFinal - b.priceFinal : b.priceFinal - a.priceFinal
  );

  return (
    <div className="space-y-4">
      {/* Статус загрузки: красный пульс, пока фоном тянется Phaeton (Р1);
          зелёная галочка, когда позиции со всех складов уже здесь. */}
      <LoadStatusBanner
        loading={phaetonSearching}
        loadingLabel={loadingLabel}
        readyLabel={readyLabel}
      />
      {state.fit && <FitBanner fit={state.fit} locale={locale} />}
      {state.level !== "exact" && <RelaxBanner level={state.level} />}
      {state.oem.length > 0 && (
        <div className="rounded-2xl bg-paper-soft px-4 py-3 text-sm dark:bg-ink-mute">
          <span className="text-ink-mute dark:text-paper-mute">
            {t("oemLabel")}{" "}
          </span>
          <span className="font-mono font-semibold [overflow-wrap:anywhere]">
            {state.oem.join(", ")}
          </span>
        </div>
      )}
      {state.offers.length > 1 && <PriceSort sort={sort} onChange={setSort} />}
      {sortedOffers.map((o, i) => (
        <OfferCard key={o.id} offer={o} index={i} locale={locale} />
      ))}

      {phaetonSearching && (
        <div className="flex items-center justify-center gap-2 py-2 text-sm text-ink-mute dark:text-paper-mute">
          <Loader2 className="h-4 w-4 animate-spin text-brand" />
          <span>{loadingLabel}</span>
        </div>
      )}

      {state.related.length > 0 && (
        <div className="space-y-3 pt-6">
          <div className="border-t border-paper-mute pt-4 dark:border-ink-mute">
            <h2 className="text-2xl font-bold sm:text-3xl">{t("relatedTitle")}</h2>
            <p className="mt-1 text-base text-ink-mute dark:text-paper-mute">
              {t("relatedHint")}
            </p>
          </div>
          {state.related.map((o, i) => (
            <OfferCard key={`rel-${o.id}`} offer={o} index={i} locale={locale} />
          ))}
        </div>
      )}

      <div className="pt-2 text-center">
        <Link href={`/${locale}/search/${kind}`} className="btn-secondary inline-flex">
          {t("newSearch")}
        </Link>
      </div>
    </div>
  );
}

function PriceSort({
  sort,
  onChange,
}: {
  sort: "asc" | "desc";
  onChange: (s: "asc" | "desc") => void;
}) {
  const t = useTranslations("results");
  const options: { value: "asc" | "desc"; label: string }[] = [
    { value: "asc", label: t("sortAsc") },
    { value: "desc", label: t("sortDesc") },
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      <span className="text-ink-mute dark:text-paper-mute">{t("sortLabel")}</span>
      <div className="inline-flex rounded-2xl border border-paper-mute bg-white p-0.5 dark:border-ink-mute dark:bg-ink-soft">
        {options.map(({ value, label }) => {
          const active = sort === value;
          return (
            <button
              key={value}
              onClick={() => onChange(value)}
              className={`whitespace-nowrap rounded-xl px-3 py-1.5 font-semibold transition ${
                active
                  ? "bg-brand text-white"
                  : "text-ink-mute hover:bg-paper dark:text-paper-mute dark:hover:bg-ink"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}


function LoadStatusBanner({
  loading,
  loadingLabel,
  readyLabel,
}: {
  loading: boolean;
  loadingLabel: string;
  readyLabel: string;
}) {
  if (loading) {
    return (
      <div className="flex animate-pulse items-center gap-3 rounded-2xl border-2 border-brand bg-brand/10 px-4 py-3">
        <span className="relative flex h-7 w-7 flex-none items-center justify-center">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand/60" />
          <span className="absolute inline-flex h-5 w-5 animate-ping rounded-full bg-brand/70 [animation-delay:150ms]" />
          <span className="relative inline-flex h-3.5 w-3.5 rounded-full bg-brand" />
        </span>
        <span className="text-sm font-semibold text-brand sm:text-base">{loadingLabel}</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3 rounded-2xl border-2 border-emerald-300 bg-emerald-50 px-4 py-3 dark:border-emerald-700/60 dark:bg-emerald-900/15">
      <CheckCircle2 className="h-5 w-5 flex-none text-emerald-600 dark:text-emerald-400" />
      <span className="text-sm font-semibold text-emerald-700 sm:text-base dark:text-emerald-300">
        {readyLabel}
      </span>
    </div>
  );
}

function FitBanner({ fit, locale }: { fit: FitWarning; locale: string }) {
  const t = useTranslations("results");
  const label = [fit.make, fit.model, fit.year].filter(Boolean).join(" ");
  const bold = (chunks: ReactNode) => <strong>{chunks}</strong>;
  // Manually-chosen car (no VIN): name results are not catalog-verified.
  if (fit.needsVin) {
    return (
      <div className="card border-2 border-amber-400 bg-amber-50 dark:border-amber-600/60 dark:bg-amber-900/20">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-8 w-8 flex-none text-amber-600" />
          <div>
            <div className="text-lg font-bold text-amber-900 dark:text-amber-100">
              {t("fitNameTitle")}
            </div>
            <p className="mt-1 text-sm leading-relaxed text-amber-900/90 dark:text-amber-100/90">
              {t.rich("fitNameBody", { label, b: bold })}
            </p>
            <Link
              href={`/${locale}/search/vin`}
              className="mt-2 inline-block text-sm font-semibold text-brand underline"
            >
              {t("fitNameVinAction")}
            </Link>
          </div>
        </div>
      </div>
    );
  }
  if (fit.level === "unconfirmed") {
    return (
      <div className="card border-2 border-amber-400 bg-amber-50 dark:border-amber-600/60 dark:bg-amber-900/20">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-8 w-8 flex-none text-amber-600" />
          <div>
            <div className="text-lg font-bold text-amber-900 dark:text-amber-100">
              {t("fitUnconfirmedTitle")}
            </div>
            <p className="mt-1 text-sm leading-relaxed text-amber-900/90 dark:text-amber-100/90">
              {t.rich("fitUnconfirmedBody", { label, b: bold })}
            </p>
            <Link
              href={`/${locale}/search/name`}
              className="mt-2 inline-block text-sm font-semibold text-brand underline"
            >
              {t("fitUnconfirmedAction", { label })}
            </Link>
          </div>
        </div>
      </div>
    );
  }
  // mismatch, shown after "Показать всё равно"
  return (
    <div className="card border-2 border-brand bg-brand/5">
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-8 w-8 flex-none text-brand" />
        <div>
          <div className="text-lg font-bold text-brand">
            {t("fitMismatchTitle")}
          </div>
          <p className="mt-1 text-sm leading-relaxed">
            {t.rich("fitMismatchBody", { label, b: bold })}
          </p>
        </div>
      </div>
    </div>
  );
}

function MismatchWarning({
  locale,
  vehicle,
  onReveal,
}: {
  locale: string;
  vehicle: FitWarning;
  onReveal: () => void;
}) {
  const t = useTranslations("results");
  const label = [vehicle.make, vehicle.model, vehicle.year]
    .filter(Boolean)
    .join(" ");
  return (
    <div className="card space-y-4 border-2 border-brand bg-brand/5">
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-9 w-9 flex-none text-brand" />
        <div>
          <div className="text-lg font-bold text-brand sm:text-xl">
            {t("mismatchTitle")}
          </div>
          <p className="mt-1 text-sm leading-relaxed">
            {t.rich("mismatchBody", {
              label,
              b: (chunks: ReactNode) => <strong>{chunks}</strong>,
            })}
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Link href={`/${locale}/search/vin`} className="btn-primary flex-1">
          {t("mismatchChangeCar")}
        </Link>
        <button onClick={onReveal} className="btn-secondary flex-1">
          {t("mismatchShowAnyway")}
        </button>
      </div>
    </div>
  );
}

function RelaxBanner({ level }: { level: RelaxLevel }) {
  const t = useTranslations("results");
  // For delivery-related levels we use a louder banner so the customer
  // immediately understands the part isn't on the Astana shelf.
  if (level === "with-delivery" || level === "any-warehouse") {
    return (
      <div className="card border-2 border-amber-300 bg-amber-50 p-5 dark:border-amber-700/60 dark:bg-amber-900/15">
        <div className="flex items-start gap-3">
          <Truck className="mt-0.5 h-7 w-7 flex-none text-amber-600" />
          <div>
            <div className="text-base font-bold text-amber-900 sm:text-lg dark:text-amber-100">
              {t("relaxDeliveryTitle")}
            </div>
            <p className="mt-1 text-sm text-amber-900/90 dark:text-amber-200/90">
              {t("relaxDeliveryBody")}
            </p>
          </div>
        </div>
      </div>
    );
  }
  const messages: Partial<Record<RelaxLevel, string>> = {
    "no-make": t("relaxNoMake"),
    "no-words": t("relaxNoWords"),
  };
  const message = messages[level];
  if (!message) return null;
  return (
    <div className="card flex items-start gap-3 border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-900/10">
      <Info className="mt-0.5 h-5 w-5 flex-none text-amber-600" />
      <p className="text-sm text-amber-900 dark:text-amber-200">{message}</p>
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
  const cart = useCart();
  const inCart = cart.isInCart(offer.id);
  const [photoOpen, setPhotoOpen] = useState(false);
  const onAdd = () => {
    cart.add({
      id: offer.id,
      brand: offer.brand,
      article: offer.article,
      name: offer.name,
      price: offer.priceFinal,
      quantity: 1,
      availableQty: offer.quantity,
      sourceCode: offer.sourceCode,
    });
  };

  return (
    <article className="card-offer">
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
        ) : offer.compat === "mismatch" ? (
          <span
            className="chip bg-brand/10 text-brand"
            title={offer.compatReason}
          >
            <AlertTriangle className="h-3 w-3" />
            {t("badgeMismatch")}
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
        {offer.fromCatalog && (
          <span
            className="chip bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-200"
            title={t("badgeCatalogHint")}
          >
            <BookOpen className="h-3 w-3" />
            {t("badgeCatalog")}
          </span>
        )}
      </div>

      {/* Заголовок: фото + крупное название в одну строку (одинаково на десктопе
          и мобиле — карточка не вытягивается). */}
      <div className="flex items-start gap-3 sm:gap-4">
        {offer.image && (
          <button
            type="button"
            onClick={() => setPhotoOpen(true)}
            className="group relative flex-none"
            aria-label="Открыть фото детали"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={offer.image}
              alt={offer.name}
              loading="lazy"
              width={96}
              height={96}
              className="h-16 w-16 rounded-2xl bg-white object-contain p-1 ring-1 ring-paper-mute transition group-hover:ring-brand sm:h-20 sm:w-20 dark:ring-ink-mute"
            />
          </button>
        )}
        {photoOpen && offer.image && (
          <PartPhotoLightbox
            thumb={offer.image}
            full={`${offer.image}${offer.image.includes("?") ? "&" : "?"}s=800`}
            alt={offer.name}
            onClose={() => setPhotoOpen(false)}
          />
        )}
        <h3 className="min-w-0 flex-1 text-lg font-bold leading-snug [overflow-wrap:anywhere] sm:text-xl">
          {offer.name}
        </h3>
      </div>

      {/* Детали (производитель / парт-номер / количество) + цена справа. */}
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end sm:gap-4">
        <div className="min-w-0">
          <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="text-ink-mute dark:text-paper-mute">{t("brand")}</dt>
            <dd className="font-semibold">{offer.brand}</dd>
            <dt className="text-ink-mute dark:text-paper-mute">{t("article")}</dt>
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
          </dl>
          {offer.shipmentDays > 0 && (
            <div className="mt-3 inline-flex items-center gap-2 rounded-2xl border-2 border-amber-300 bg-amber-50 px-3 py-2 text-amber-900 dark:border-amber-700/60 dark:bg-amber-900/20 dark:text-amber-100">
              <Clock className="h-5 w-5 flex-none" />
              <div className="leading-tight">
                <div className="text-[11px] uppercase tracking-wider">
                  {t("shipmentLabel")}
                </div>
                <div className="text-lg font-semibold">
                  {t("shipmentDays", { n: offer.shipmentDays })}
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="flex items-baseline justify-between gap-2 sm:block sm:text-right">
          <div className="text-xs uppercase tracking-wider text-ink-mute dark:text-paper-mute">
            {t("price")}
          </div>
          <div className="price-brand text-2xl font-semibold">
            {formatKzt(offer.priceFinal)}
            <span className="ml-1 text-sm font-medium text-ink-mute dark:text-paper-mute">
              {t("priceUnit")}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        {inCart ? (
          <>
            <Link href={`/${locale}/cart`} className="btn-primary flex-1">
              <ShoppingCart className="h-4 w-4" />
              {t("goToCart")}
            </Link>
            <button
              onClick={() => cart.remove(offer.id)}
              className="btn-secondary"
              aria-label={t("removeFromCart")}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </>
        ) : (
          <button onClick={onAdd} className="btn-primary flex-1">
            <ShoppingCart className="h-4 w-4" />
            {t("addToCart")}
          </button>
        )}
      </div>
    </article>
  );
}
