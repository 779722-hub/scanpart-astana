"use client";

import Link from "next/link";
import {
  Loader2,
  Minus,
  Plus,
  ShoppingCart,
  Trash2,
  Truck,
  Store,
} from "lucide-react";
import { useCart } from "@/lib/cart";

const fmt = (n: number) => new Intl.NumberFormat("ru-RU").format(n);

export function CartView({ locale }: { locale: string }) {
  const cart = useCart();

  if (!cart.hydrated) {
    return (
      <div className="card flex items-center justify-center gap-3 py-12">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (cart.items.length === 0) {
    return (
      <div className="card space-y-4 text-center">
        <ShoppingCart className="mx-auto h-12 w-12 text-ink-mute" />
        <h1 className="text-2xl font-bold">Корзина пуста</h1>
        <p className="text-ink-mute dark:text-paper-mute">
          Добавьте запчасти из результатов поиска.
        </p>
        <Link href={`/${locale}`} className="btn-primary inline-flex">
          На главную
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Корзина
          </h1>
          <p className="mt-1 text-sm text-ink-mute dark:text-paper-mute">
            {cart.items.length} поз. · {cart.totalCount} шт.
          </p>
        </div>
        <button
          onClick={cart.clear}
          className="text-sm text-ink-mute underline hover:text-brand"
        >
          Очистить корзину
        </button>
      </header>

      <ul className="space-y-3">
        {cart.items.map((item) => (
          <li key={item.id} className="card">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-bold leading-tight sm:text-lg">
                  {item.name}
                </h3>
                <div className="mt-1 text-xs text-ink-mute dark:text-paper-mute">
                  {item.brand} · <span className="font-mono">{item.article}</span>
                </div>
              </div>
              <button
                onClick={() => cart.remove(item.id)}
                className="flex h-9 w-9 flex-none items-center justify-center rounded-xl text-ink-mute hover:bg-paper-soft hover:text-brand dark:hover:bg-ink-mute"
                aria-label="Удалить"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="text-xs text-ink-mute dark:text-paper-mute">
                  Цена за шт.
                </div>
                <div className="font-bold">{fmt(item.price)} ₸</div>
              </div>

              <div>
                <div className="mb-1 text-xs text-ink-mute dark:text-paper-mute">
                  В наличии: {item.availableQty}
                </div>
                <div className="inline-flex items-center overflow-hidden rounded-2xl border border-paper-mute dark:border-ink">
                  <button
                    onClick={() => cart.setQty(item.id, item.quantity - 1)}
                    disabled={item.quantity <= 1}
                    className="flex h-10 w-10 items-center justify-center text-ink-mute disabled:opacity-40 hover:bg-paper dark:text-paper-mute dark:hover:bg-ink"
                    aria-label="−"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <input
                    type="number"
                    min={1}
                    max={item.availableQty}
                    value={item.quantity}
                    onChange={(e) =>
                      cart.setQty(item.id, Number(e.target.value) || 1)
                    }
                    className="h-10 w-14 border-x border-paper-mute bg-transparent text-center text-base font-bold outline-none dark:border-ink"
                  />
                  <button
                    onClick={() => cart.setQty(item.id, item.quantity + 1)}
                    disabled={item.quantity >= item.availableQty}
                    className="flex h-10 w-10 items-center justify-center text-ink-mute disabled:opacity-40 hover:bg-paper dark:text-paper-mute dark:hover:bg-ink"
                    aria-label="+"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="text-right">
                <div className="text-xs text-ink-mute dark:text-paper-mute">
                  Сумма
                </div>
                <div className="text-xl font-black text-brand">
                  {fmt(item.price * item.quantity)} ₸
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <div className="card sticky bottom-2 z-10 space-y-4">
        <div className="flex items-baseline justify-between">
          <span className="text-base font-semibold">Итого к оплате</span>
          <span className="text-3xl font-black text-brand">
            {fmt(cart.totalPrice)} ₸
          </span>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Link
            href={`/${locale}/order/express`}
            className="btn-primary flex-1"
          >
            <Truck className="h-4 w-4" />
            Экспресс-доставка
          </Link>
          <Link
            href={`/${locale}/order/pickup`}
            className="btn-secondary flex-1"
          >
            <Store className="h-4 w-4" />
            Самовывоз
          </Link>
        </div>
      </div>
    </div>
  );
}
