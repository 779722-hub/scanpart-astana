"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  Loader2,
  Package,
  Check,
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
import { useCart } from "@/lib/cart";
import { CopyVin } from "@/components/copy-vin";

interface FitWarning {
  make: string;
  model: string;
  year: string;
  level: "mismatch" | "unconfirmed";
  needsVin?: boolean;
}

type State =
  | { kind: "loading" }
  | { kind: "empty" }
  | { kind: "error"; message?: string }
  | {
      kind: "ok";
      offers: PartOffer[];
      level: RelaxLevel;
      fit: FitWarning | null;
    };

function formatKzt(n: number): string {
  return new Intl.NumberFormat("ru-RU").format(n);
}

function dayWord(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "день";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "дня";
  return "дней";
}

export function ResultsList({
  locale,
  q,
  strict = false,
  kind = "article",
  vin = "",
}: {
  locale: string;
  q: string;
  strict?: boolean;
  kind?: "article" | "name";
  vin?: string;
}) {
  const t = useTranslations("results");
  const [state, setState] = useState<State>({ kind: "loading" });
  const [revealed, setRevealed] = useState(false);
  const [sort, setSort] = useState<"asc" | "desc">("asc");

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
          fit: (json.fitWarning as FitWarning | null) ?? null,
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
      <div className="card flex flex-col items-center justify-center gap-4 py-14 text-center">
        <span className="relative flex h-16 w-16 items-center justify-center">
          <span className="absolute inset-0 animate-ping rounded-full bg-brand/20" />
          <span className="absolute inset-2 rounded-full bg-brand/10" />
          <Loader2 className="h-9 w-9 animate-spin text-brand" />
        </span>
        <div>
          <div className="text-lg font-bold">Ожидайте, идёт поиск по базе…</div>
          <div className="mt-1 text-sm text-ink-mute dark:text-paper-mute">
            Проверяем наличие на складе в Астане
          </div>
        </div>
      </div>
    );
  }

  if (state.kind === "empty") {
    return (
      <div className="space-y-4">
        <div className="card space-y-5 text-center">
          <Package className="mx-auto h-12 w-12 text-ink-mute" />
          <p className="text-lg">{t("empty")}</p>
          <Link href={`/${locale}/search/${kind}`} className="btn-primary inline-flex">
            {t("newSearch")}
          </Link>
        </div>
        <CatalogHint vin={vin} />
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
      {state.fit && <FitBanner fit={state.fit} locale={locale} />}
      {state.level !== "exact" && <RelaxBanner level={state.level} />}
      {state.offers.length > 1 && <PriceSort sort={sort} onChange={setSort} />}
      {sortedOffers.map((o, i) => (
        <OfferCard key={o.id} offer={o} index={i} locale={locale} />
      ))}
      {state.level !== "exact" && <CatalogHint vin={vin} />}
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
  const options: { value: "asc" | "desc"; label: string }[] = [
    { value: "asc", label: "Сначала дешевле" },
    { value: "desc", label: "Сначала дороже" },
  ];
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-ink-mute dark:text-paper-mute">Сортировка:</span>
      <div className="inline-flex rounded-2xl border border-paper-mute bg-white p-0.5 dark:border-ink-mute dark:bg-ink-soft">
        {options.map(({ value, label }) => {
          const active = sort === value;
          return (
            <button
              key={value}
              onClick={() => onChange(value)}
              className={`rounded-xl px-3 py-1.5 font-semibold transition ${
                active
                  ? "bg-brand text-white shadow-card"
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

function CatalogHint({ vin }: { vin?: string }) {
  const t = useTranslations("results");
  return (
    <div className="card space-y-3">
      <div className="text-sm font-semibold">{t("catalogHintTitle")}</div>
      {vin && <CopyVin vin={vin} />}
      <p className="text-xs text-ink-mute dark:text-paper-mute">
        {t("catalogHintFooter")}
      </p>
    </div>
  );
}

function FitBanner({ fit, locale }: { fit: FitWarning; locale: string }) {
  const label = [fit.make, fit.model, fit.year].filter(Boolean).join(" ");
  // Manually-chosen car (no VIN): name results are not catalog-verified.
  if (fit.needsVin) {
    return (
      <div className="card border-2 border-amber-400 bg-amber-50 dark:border-amber-600/60 dark:bg-amber-900/20">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-8 w-8 flex-none text-amber-600" />
          <div>
            <div className="text-lg font-bold text-amber-900 dark:text-amber-100">
              Показаны совпадения по названию — без проверки на ваш авто
            </div>
            <p className="mt-1 text-sm leading-relaxed text-amber-900/90 dark:text-amber-100/90">
              Точный подбор по названию для <strong>{label}</strong> работает по
              VIN (каталог производителя). Укажите VIN, чтобы показать только
              подходящие детали.
            </p>
            <Link
              href={`/${locale}/search/vin`}
              className="mt-2 inline-block text-sm font-semibold text-brand underline"
            >
              Указать VIN
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
              Совместимость с вашим авто не подтверждена
            </div>
            <p className="mt-1 text-sm leading-relaxed text-amber-900/90 dark:text-amber-100/90">
              Не удалось подтвердить, что этот номер подходит для{" "}
              <strong>{label}</strong>. Проверьте номер или подберите деталь по
              названию для вашего авто.
            </p>
            <Link
              href={`/${locale}/search/name`}
              className="mt-2 inline-block text-sm font-semibold text-brand underline"
            >
              Подобрать по названию для {label}
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
            Эти детали не для вашего авто
          </div>
          <p className="mt-1 text-sm leading-relaxed">
            Показаны результаты по номеру, но по описанию они для другого
            автомобиля, а не для <strong>{label}</strong>.
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
  const label = [vehicle.make, vehicle.model, vehicle.year]
    .filter(Boolean)
    .join(" ");
  return (
    <div className="card space-y-4 border-2 border-brand bg-brand/5">
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-9 w-9 flex-none text-brand" />
        <div>
          <div className="text-lg font-bold text-brand sm:text-xl">
            Этот парт-номер не для вашего авто
          </div>
          <p className="mt-1 text-sm leading-relaxed">
            Введённый парт-номер, судя по описанию, для другого автомобиля, а не
            для <strong>{label}</strong>. Проверьте номер или смените авто.
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Link href={`/${locale}/search/vin`} className="btn-primary flex-1">
          Сменить авто
        </Link>
        <button onClick={onReveal} className="btn-secondary flex-1">
          Показать всё равно
        </button>
      </div>
    </div>
  );
}

function RelaxBanner({ level }: { level: RelaxLevel }) {
  // For delivery-related levels we use a louder banner so the customer
  // immediately understands the part isn't on the Astana shelf.
  if (level === "with-delivery" || level === "any-warehouse") {
    return (
      <div className="card border-2 border-amber-300 bg-amber-50 p-5 dark:border-amber-700/60 dark:bg-amber-900/15">
        <div className="flex items-start gap-3">
          <Truck className="mt-0.5 h-7 w-7 flex-none text-amber-600" />
          <div>
            <div className="text-base font-bold text-amber-900 sm:text-lg dark:text-amber-100">
              На складе в Астане нет в наличии
            </div>
            <p className="mt-1 text-sm text-amber-900/90 dark:text-amber-200/90">
              Можно заказать с доставкой с другого склада. Срок доставки указан
              в каждой карточке ниже.
            </p>
          </div>
        </div>
      </div>
    );
  }
  const messages: Partial<Record<RelaxLevel, string>> = {
    "no-make":
      "Точных совпадений с вашей маркой нет — показаны другие варианты в наличии в Астане.",
    "no-words":
      "По вашему запросу совпадений в Астане нет — показаны похожие позиции, которые есть в наличии.",
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
        ) : offer.compat === "mismatch" ? (
          <span
            className="chip bg-brand/10 text-brand"
            title={offer.compatReason}
          >
            <AlertTriangle className="h-3 w-3" />
            не для вашего авто
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
            title="Парт-номер найден в каталоге автозапчастей по вашему запросу"
          >
            <BookOpen className="h-3 w-3" />
            {t("badgeCatalog")}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end sm:gap-4">
        <div className="min-w-0">
          <h3 className="text-base font-bold leading-tight [overflow-wrap:anywhere] sm:text-xl">{offer.name}</h3>
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
          </dl>
          {offer.shipmentDays > 0 && (
            <div className="mt-3 inline-flex items-center gap-2 rounded-2xl border-2 border-amber-300 bg-amber-50 px-3 py-2 text-amber-900 dark:border-amber-700/60 dark:bg-amber-900/20 dark:text-amber-100">
              <Clock className="h-5 w-5 flex-none" />
              <div className="leading-tight">
                <div className="text-[11px] uppercase tracking-wider">
                  Доставка под заказ
                </div>
                <div className="text-lg font-black sm:text-xl">
                  ~{offer.shipmentDays} {dayWord(offer.shipmentDays)}
                </div>
              </div>
            </div>
          )}
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
        {inCart ? (
          <>
            <Link href={`/${locale}/cart`} className="btn-primary flex-1">
              <ShoppingCart className="h-4 w-4" />
              Перейти в корзину
            </Link>
            <button
              onClick={() => cart.remove(offer.id)}
              className="btn-secondary"
              aria-label="Удалить из корзины"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </>
        ) : (
          <button onClick={onAdd} className="btn-primary flex-1">
            <ShoppingCart className="h-4 w-4" />
            В корзину
          </button>
        )}
      </div>
    </article>
  );
}
