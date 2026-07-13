"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Loader2,
  Minus,
  Plus,
  ShoppingCart,
  Trash2,
  Truck,
  Store,
  Clock,
  MapPin,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useCart } from "@/lib/cart";

const fmt = (n: number) => new Intl.NumberFormat("ru-RU").format(n);

interface PublicSettings {
  expressDeliveryPrice: number;
  expressHours: string;
  pickupAddress: string;
  pickupHours: string;
}

const DEFAULTS: PublicSettings = {
  expressDeliveryPrice: 4000,
  expressHours: "Пн–Сб 09:00–16:30",
  pickupAddress: "г. Астана, пр. Республики, 68",
  pickupHours: "завтра с 14:00 до 18:00",
};

export function CartView({ locale }: { locale: string }) {
  const t = useTranslations("cart");
  const cart = useCart();
  const [settings, setSettings] = useState<PublicSettings>(DEFAULTS);

  useEffect(() => {
    fetch("/api/public/settings")
      .then((r) => r.json())
      .then((j) => {
        if (j.ok && j.settings) setSettings({ ...DEFAULTS, ...j.settings });
      })
      .catch(() => {});
  }, []);

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
        <ShoppingCart className="mx-auto h-12 w-12 text-ink-mute dark:text-paper-mute" />
        <h1 className="text-2xl font-bold">{t("empty")}</h1>
        <p className="text-ink-mute dark:text-paper-mute">{t("emptyHint")}</p>
        <Link href={`/${locale}`} className="btn-primary inline-flex">
          {t("toHome")}
        </Link>
      </div>
    );
  }

  const deliveryFee = cart.kind === "express" ? settings.expressDeliveryPrice : 0;
  const grandTotal = cart.itemsTotal + deliveryFee;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            {t("title")}
          </h1>
          <p className="mt-1 text-sm text-ink-mute dark:text-paper-mute">
            {cart.items.length} {t("addedSuffix")} · {cart.totalCount} {t("qtySuffix")}
          </p>
        </div>
        <button
          onClick={cart.clear}
          className="inline-flex items-center gap-1.5 rounded-xl border border-paper-mute px-3 py-1.5 text-sm font-medium text-ink-mute transition hover:border-brand hover:text-brand dark:border-ink-mute dark:text-paper-mute dark:hover:border-brand dark:hover:text-brand"
        >
          <Trash2 className="h-3.5 w-3.5" />
          {t("clear")}
        </button>
      </header>

      <ul className="space-y-3">
        {cart.items.map((item) => (
          <li key={item.id} className="card">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-bold leading-tight [overflow-wrap:anywhere] sm:text-lg">
                  {item.name}
                </h3>
                <div className="mt-1 text-xs text-ink-mute dark:text-paper-mute">
                  {item.brand} · <span className="font-mono">{item.article}</span>
                </div>
              </div>
              <button
                onClick={() => cart.remove(item.id)}
                className="inline-flex h-9 flex-none items-center justify-center gap-1.5 rounded-xl border border-brand/40 bg-brand/5 px-3 text-sm font-semibold text-brand transition hover:border-brand hover:bg-brand/10"
                aria-label={t("remove")}
              >
                <Trash2 className="h-4 w-4" />
                <span className="hidden sm:inline">{t("remove")}</span>
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
                  {t("subtotalParts")}
                </div>
                <div className="text-xl font-black text-brand">
                  {fmt(item.price * item.quantity)} ₸
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {/* Способ получения */}
      <div className="card space-y-3">
        <div className="text-sm font-semibold">{t("deliveryHeader")}</div>

        <label
          className={`flex cursor-pointer items-start gap-3 rounded-2xl border-2 p-3 transition ${
            cart.kind === "express"
              ? "border-brand bg-brand/5"
              : "border-paper-mute hover:border-ink-mute dark:border-ink-mute"
          }`}
        >
          <input
            type="radio"
            name="delivery-kind"
            checked={cart.kind === "express"}
            onChange={() => cart.setKind("express")}
            className="mt-1 h-4 w-4 accent-brand"
          />
          <div className="flex-1">
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold">
                <Truck className="mr-1 inline h-4 w-4 text-brand" />
                {t("deliveryExpress")}
              </span>
              <span className="font-black text-brand">
                +{fmt(settings.expressDeliveryPrice)} ₸
              </span>
            </div>
            <div className="mt-1 text-xs text-ink-mute dark:text-paper-mute">
              <Clock className="mr-1 inline h-3 w-3" />
              {t("deliveryExpressHint", { hours: settings.expressHours })}
            </div>
          </div>
        </label>

        <label
          className={`flex cursor-pointer items-start gap-3 rounded-2xl border-2 p-3 transition ${
            cart.kind === "pickup"
              ? "border-brand bg-brand/5"
              : "border-paper-mute hover:border-ink-mute dark:border-ink-mute"
          }`}
        >
          <input
            type="radio"
            name="delivery-kind"
            checked={cart.kind === "pickup"}
            onChange={() => cart.setKind("pickup")}
            className="mt-1 h-4 w-4 accent-brand"
          />
          <div className="flex-1">
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold">
                <Store className="mr-1 inline h-4 w-4 text-brand" />
                {t("deliveryPickup")}
              </span>
              <span className="font-black text-emerald-600">{t("deliveryFree")}</span>
            </div>
            <div className="mt-1 text-xs text-ink-mute dark:text-paper-mute">
              <MapPin className="mr-1 inline h-3 w-3" />
              {t("deliveryPickupHint", { address: settings.pickupAddress, hours: settings.pickupHours })}
            </div>
          </div>
        </label>
      </div>

      {/* Итог + кнопка оформления — брендовая обводка, чтобы было понятно,
          что это окно корзины; компактнее основной сетки (~15%). */}
      <div className="card sticky bottom-2 z-10 space-y-2 !p-3.5 ring-2 ring-brand sm:!p-5">
        <div className="space-y-1 text-sm">
          <div className="flex items-baseline justify-between">
            <span className="text-ink-mute dark:text-paper-mute">{t("subtotalParts")}</span>
            <span className="font-semibold">{fmt(cart.itemsTotal)} ₸</span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-ink-mute dark:text-paper-mute">
              {cart.kind === "express" ? t("subtotalDelivery") : t("subtotalPickup")}
            </span>
            <span className="font-semibold">
              {deliveryFee > 0 ? `${fmt(deliveryFee)} ₸` : "—"}
            </span>
          </div>
        </div>
        <div className="flex items-baseline justify-between border-t border-paper-mute/60 pt-2 dark:border-ink/40">
          <span className="text-sm font-semibold">{t("grandTotal")}</span>
          <span className="text-2xl font-black text-brand">
            {fmt(grandTotal)} ₸
          </span>
        </div>
        <Link
          href={`/${locale}/order/${cart.kind}`}
          className="btn-primary w-full !py-2.5 sm:!py-3"
        >
          {t("checkout")}
        </Link>
      </div>
    </div>
  );
}
