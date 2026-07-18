"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, Tag, ShoppingCart, Trash2, Car, Clock } from "lucide-react";
import { useCart } from "@/lib/cart";

interface SaleItem {
  id: string;
  brand: string;
  article: string;
  name: string;
  applicability: string;
  make: string;
  price: number;
  oldPrice: number | null;
  deliveryDays: number;
  available: number;
  image: string;
}

const fmt = (n: number) => new Intl.NumberFormat("ru-RU").format(n);

type Sort = "make" | "price-asc" | "price-desc" | "discount";

export function SaleList({ locale }: { locale: string }) {
  const cart = useCart();
  const [items, setItems] = useState<SaleItem[] | null>(null);
  const [makes, setMakes] = useState<string[]>([]);
  const [sort, setSort] = useState<Sort>("make");
  const [make, setMake] = useState("");
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setItems(null);
    const p = new URLSearchParams({ sort });
    if (make) p.set("make", make);
    fetch(`/api/sale?${p.toString()}`)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        setEnabled(j.enabled !== false);
        setItems(j.ok ? (j.items as SaleItem[]) : []);
        if (j.makes?.length) setMakes(j.makes as string[]);
      })
      .catch(() => !cancelled && setItems([]));
    return () => {
      cancelled = true;
    };
  }, [sort, make]);

  const sortOptions: { v: Sort; l: string }[] = useMemo(
    () => [
      { v: "make", l: "По марке авто" },
      { v: "discount", l: "По скидке" },
      { v: "price-asc", l: "Сначала дешёвые" },
      { v: "price-desc", l: "Сначала дорогие" },
    ],
    []
  );

  return (
    <div className="mx-auto max-w-4xl space-y-5 px-4 py-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold sm:text-3xl">
          <Tag className="h-7 w-7 text-brand" /> Распродажа
        </h1>
        <p className="mt-1 text-ink-mute dark:text-paper-mute">
          Товары по сниженным ценам, в наличии в Астане.
        </p>
      </div>

      {enabled && (
        <div className="card flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <span className="text-ink-mute dark:text-paper-mute">Сортировка</span>
            <select className="input !w-auto !py-2" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
              {sortOptions.map((o) => (
                <option key={o.v} value={o.v}>
                  {o.l}
                </option>
              ))}
            </select>
          </label>
          {makes.length > 0 && (
            <label className="flex items-center gap-2 text-sm">
              <span className="text-ink-mute dark:text-paper-mute">Марка</span>
              <select className="input !w-auto !py-2" value={make} onChange={(e) => setMake(e.target.value)}>
                <option value="">Все</option>
                {makes.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
          )}
          {items && <span className="ml-auto text-xs text-ink-mute dark:text-paper-mute">товаров: {items.length}</span>}
        </div>
      )}

      {items === null ? (
        <div className="card flex justify-center py-14">
          <Loader2 className="h-6 w-6 animate-spin text-brand" />
        </div>
      ) : !enabled ? (
        <div className="card text-center text-ink-mute dark:text-paper-mute">Распродажа сейчас недоступна.</div>
      ) : items.length === 0 ? (
        <div className="card text-center text-ink-mute dark:text-paper-mute">Пока нет товаров по распродаже в Астане.</div>
      ) : (
        <div className="space-y-3">
          {items.map((it) => (
            <SaleCard key={it.id} item={it} locale={locale} cart={cart} />
          ))}
        </div>
      )}
    </div>
  );
}

function SaleCard({
  item,
  locale,
  cart,
}: {
  item: SaleItem;
  locale: string;
  cart: ReturnType<typeof useCart>;
}) {
  const inCart = cart.isInCart(item.id);
  const discount =
    item.oldPrice && item.oldPrice > item.price
      ? Math.round(((item.oldPrice - item.price) / item.oldPrice) * 100)
      : 0;
  const img = item.image;

  return (
    <article className="card-offer">
      <div className="flex items-start gap-3 sm:gap-4">
        <button type="button" className="group flex-none" aria-label="Фото">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={img}
            alt={item.name}
            loading="lazy"
            width={80}
            height={80}
            className="h-16 w-16 rounded-2xl bg-white object-contain p-1 ring-1 ring-paper-mute sm:h-20 sm:w-20 dark:ring-ink-mute"
          />
        </button>
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-bold leading-snug [overflow-wrap:anywhere]">{item.name}</h3>
          <div className="mt-1 text-sm text-ink-mute dark:text-paper-mute">
            {item.brand} · <span className="font-mono">{item.article}</span>
          </div>
          {item.applicability && (
            <div className="mt-1 flex items-start gap-1.5 text-xs text-ink-mute dark:text-paper-mute [overflow-wrap:anywhere]">
              <Car className="mt-0.5 h-3.5 w-3.5 flex-none" />
              <span>{item.applicability}</span>
            </div>
          )}
        </div>
        <div className="flex-none text-right">
          {discount > 0 && (
            <span className="mb-1 inline-block rounded-full bg-brand px-2 py-0.5 text-xs font-bold text-white">
              −{discount}%
            </span>
          )}
          <div className="price-brand text-2xl font-semibold">
            {fmt(item.price)} <span className="text-sm font-medium text-ink-mute dark:text-paper-mute">₸</span>
          </div>
          {item.oldPrice && item.oldPrice > item.price && (
            <div className="text-sm text-ink-mute line-through dark:text-paper-mute">{fmt(item.oldPrice)} ₸</div>
          )}
          {item.deliveryDays > 0 && (
            <div className="mt-1 inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-300">
              <Clock className="h-3 w-3" /> {item.deliveryDays} дн.
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        {inCart ? (
          <>
            <Link href={`/${locale}/cart`} className="btn-primary flex-1">
              <ShoppingCart className="h-4 w-4" /> В корзине
            </Link>
            <button onClick={() => cart.remove(item.id)} className="btn-secondary" aria-label="Убрать">
              <Trash2 className="h-4 w-4" />
            </button>
          </>
        ) : (
          <button
            onClick={() =>
              cart.add({
                id: item.id,
                brand: item.brand,
                article: item.article,
                name: item.name,
                price: item.price,
                quantity: 1,
                availableQty: item.available || 1,
                sourceCode: "Р1",
              })
            }
            className="btn-primary flex-1"
          >
            <ShoppingCart className="h-4 w-4" /> В корзину
          </button>
        )}
      </div>
    </article>
  );
}
