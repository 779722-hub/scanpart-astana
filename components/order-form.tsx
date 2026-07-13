"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Loader2,
  ChevronLeft,
  CheckCircle2,
  ExternalLink,
  ShoppingCart,
  Truck,
  Store,
} from "lucide-react";
import { orderFormSchema, type OrderFormInput } from "@/lib/schemas";
import { useCart } from "@/lib/cart";

const fmt = (n: number) => new Intl.NumberFormat("ru-RU").format(n);

interface PublicSettings {
  expressDeliveryPrice: number;
  pickupAddress: string;
  pickupHours: string;
}

export function OrderForm({
  locale,
  kind,
  defaults,
}: {
  locale: string;
  kind: "express" | "pickup";
  defaults?: { name?: string; phone?: string; whatsapp?: string };
}) {
  const t = useTranslations("order");
  const tErr = useTranslations("errors");
  const cart = useCart();
  const [status, setStatus] =
    useState<"idle" | "submitting" | "success" | "error">("idle");
  const [whatsappUrl, setWhatsappUrl] = useState<string | null>(null);
  const [settings, setSettings] = useState<PublicSettings>({
    expressDeliveryPrice: 4000,
    pickupAddress: "г. Астана, пр. Республики, 68",
    pickupHours: "завтра с 14:00 до 18:00",
  });

  useEffect(() => {
    fetch("/api/public/settings")
      .then((r) => r.json())
      .then((j) => {
        if (j.ok) setSettings((prev) => ({ ...prev, ...j.settings }));
      })
      .catch(() => {});
  }, []);

  const itemsTotal = cart.itemsTotal;
  const deliveryFee = kind === "express" ? settings.expressDeliveryPrice : 0;
  const grandTotal = itemsTotal + deliveryFee;

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<OrderFormInput>({
    resolver: zodResolver(orderFormSchema),
    defaultValues: {
      kind,
      name: defaults?.name ?? "",
      phone: defaults?.phone ?? "",
      whatsapp: defaults?.whatsapp ?? "",
      address: "",
    },
  });

  // Empty cart guard.
  if (cart.hydrated && cart.items.length === 0 && status !== "success") {
    return (
      <div className="card space-y-4 text-center">
        <ShoppingCart className="mx-auto h-12 w-12 text-ink-mute dark:text-paper-mute" />
        <h1 className="text-2xl font-bold">Корзина пуста</h1>
        <p className="text-ink-mute dark:text-paper-mute">
          Сначала добавьте позиции из поиска.
        </p>
        <Link href={`/${locale}`} className="btn-primary inline-flex">
          На главную
        </Link>
      </div>
    );
  }

  async function onSubmit(data: OrderFormInput) {
    setStatus("submitting");
    try {
      const items = cart.items.map((i) => ({
        brand: i.brand,
        article: i.article,
        partName: i.name,
        price: i.price,
        quantity: i.quantity,
        sourceCode: i.sourceCode,
      }));
      const res = await fetch("/api/order", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...data, kind, items }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setStatus("error");
        return;
      }
      setWhatsappUrl(json.whatsappUrl ?? null);
      setStatus("success");
      cart.clear();
      // Make the confirmation impossible to miss (esp. on mobile, where the
      // submit button sits below the fold).
      if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setStatus("error");
    }
  }

  if (status === "success") {
    const message = kind === "express" ? t("successExpress") : t("successPickup");
    return (
      <div className="card space-y-5">
        <div className="flex items-center gap-3 text-emerald-600">
          <CheckCircle2 className="h-9 w-9 flex-none" />
          <h2 className="text-2xl font-bold sm:text-3xl">Заказ создан</h2>
        </div>
        <p className="text-pretty text-lg font-semibold leading-relaxed">
          Наш менеджер свяжется с вами в ближайшее время для уточнения заказа и
          оплаты.
        </p>
        <p className="text-pretty text-sm leading-relaxed text-ink-mute dark:text-paper-mute">
          {message}
        </p>
        {whatsappUrl && (
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noreferrer"
            className="btn-secondary w-full"
          >
            <ExternalLink className="h-4 w-4" />
            {t("openWhatsApp")}
          </a>
        )}
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link href={`/${locale}`} className="btn-primary flex-1">
            На главную
          </Link>
          <Link href={`/${locale}/search/article`} className="btn-secondary flex-1">
            {t("back")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="card space-y-4">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            {kind === "express" ? t("expressTitle") : t("pickupTitle")}
          </h1>
          <Link
            href={`/${locale}/cart`}
            className="rounded-full p-2 text-ink-mute dark:text-paper-mute hover:bg-paper-soft dark:hover:bg-ink-mute"
            title="Назад в корзину"
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>
        </div>

        <ul className="space-y-2 rounded-2xl bg-paper-soft p-3 text-sm dark:bg-ink-mute">
          {cart.items.map((item) => (
            <li key={item.id} className="flex items-baseline justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{item.name}</div>
                <div className="text-xs text-ink-mute dark:text-paper-mute">
                  {item.brand} · {item.article} · {fmt(item.price)} ₸ × {item.quantity}
                </div>
              </div>
              <div className="flex-none whitespace-nowrap font-bold">
                {fmt(item.price * item.quantity)} ₸
              </div>
            </li>
          ))}
          <li className="border-t border-paper-mute/60 pt-2 text-xs dark:border-ink/40">
            <div className="flex justify-between">
              <span className="text-ink-mute dark:text-paper-mute">
                Сумма запчастей
              </span>
              <span className="font-semibold">{fmt(itemsTotal)} ₸</span>
            </div>
            <div className="mt-1 flex justify-between">
              <span className="inline-flex items-center gap-1 text-ink-mute dark:text-paper-mute">
                {kind === "express" ? (
                  <>
                    <Truck className="h-3 w-3" /> Экспресс-доставка (от 2 до 4 ч)
                  </>
                ) : (
                  <>
                    <Store className="h-3 w-3" /> Самовывоз ({settings.pickupHours})
                  </>
                )}
              </span>
              <span className="font-semibold">
                {deliveryFee > 0 ? `${fmt(deliveryFee)} ₸` : "бесплатно"}
              </span>
            </div>
          </li>
          <li className="flex items-baseline justify-between border-t border-paper-mute/60 pt-2 text-base font-bold dark:border-ink/40">
            <span>Итого к оплате</span>
            <span className="text-xl text-brand">{fmt(grandTotal)} ₸</span>
          </li>
        </ul>

        <div>
          <label className="label">{t("name")}</label>
          <input className="input" autoComplete="name" {...register("name")} />
          {errors.name && (
            <p className="mt-1 text-sm text-brand">{tErr("requiredField")}</p>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label">{t("phone")}</label>
            <input
              className="input"
              inputMode="tel"
              autoComplete="tel"
              placeholder="+77051112233"
              {...register("phone")}
            />
            {errors.phone && (
              <p className="mt-1 text-sm text-brand">{tErr("invalidPhone")}</p>
            )}
          </div>
          <div>
            <label className="label">{t("whatsapp")}</label>
            <input
              className="input"
              inputMode="tel"
              placeholder="+77051112233"
              {...register("whatsapp")}
            />
            {errors.whatsapp && (
              <p className="mt-1 text-sm text-brand">{tErr("invalidPhone")}</p>
            )}
          </div>
        </div>

        {kind === "express" && (
          <div>
            <label className="label">{t("address")}</label>
            <input
              className="input"
              autoComplete="street-address"
              {...register("address")}
            />
            {errors.address && (
              <p className="mt-1 text-sm text-brand">{tErr("requiredField")}</p>
            )}
          </div>
        )}

        {status === "error" && (
          <div className="rounded-2xl bg-brand/10 px-4 py-3 text-sm font-medium text-brand">
            {t("errorGeneric")}
          </div>
        )}

        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            className="btn-primary flex-1"
            disabled={status === "submitting"}
          >
            {status === "submitting" ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("sending")}
              </>
            ) : (
              t("submit")
            )}
          </button>
          <Link href={`/${locale}/cart`} className="btn-secondary flex-1">
            <ChevronLeft className="h-4 w-4" />
            Назад в корзину
          </Link>
        </div>
      </div>
    </form>
  );
}
