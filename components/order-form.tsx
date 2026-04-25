"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Loader2,
  ChevronLeft,
  CheckCircle2,
  ExternalLink,
  Minus,
  Plus,
} from "lucide-react";
import { orderSchema, type OrderInput } from "@/lib/schemas";

export interface SelectedPart {
  brand: string;
  article: string;
  name: string;
  price: number;
  quantity: number;
  /** How many are physically on the Astana shelf — upper bound for the qty input. */
  availableQty: number;
}

const fmt = (n: number) => new Intl.NumberFormat("ru-RU").format(n);

export function OrderForm({
  locale,
  kind,
  part,
}: {
  locale: string;
  kind: "express" | "pickup";
  part: SelectedPart;
}) {
  const t = useTranslations("order");
  const tErr = useTranslations("errors");
  const [status, setStatus] =
    useState<"idle" | "submitting" | "success" | "error">("idle");
  const [whatsappUrl, setWhatsappUrl] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { errors },
  } = useForm<OrderInput>({
    resolver: zodResolver(orderSchema),
    defaultValues: {
      kind,
      brand: part.brand,
      article: part.article,
      partName: part.name,
      price: part.price,
      quantity: Math.max(1, Math.min(part.quantity || 1, part.availableQty || 99)),
    },
  });

  const watchedQty = useWatch({ control, name: "quantity", defaultValue: 1 }) as number;
  const qty = Math.max(1, Math.min(Number(watchedQty) || 1, part.availableQty));
  const total = qty * part.price;
  const setQty = (n: number) => {
    const clamped = Math.max(1, Math.min(n, part.availableQty));
    setValue("quantity", clamped, { shouldValidate: true });
  };

  async function onSubmit(data: OrderInput) {
    setStatus("submitting");
    try {
      const res = await fetch("/api/order", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setStatus("error");
        return;
      }
      setWhatsappUrl(json.whatsappUrl ?? null);
      setStatus("success");
    } catch {
      setStatus("error");
    }
  }

  if (status === "success") {
    const message = kind === "express" ? t("successExpress") : t("successPickup");
    return (
      <div className="card space-y-5">
        <div className="flex items-center gap-3 text-brand">
          <CheckCircle2 className="h-8 w-8" />
          <h2 className="text-2xl font-bold">OK</h2>
        </div>
        <p className="text-pretty leading-relaxed">{message}</p>
        <div className="flex flex-col gap-3 sm:flex-row">
          {whatsappUrl && (
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noreferrer"
              className="btn-primary flex-1"
            >
              <ExternalLink className="h-4 w-4" />
              {t("openWhatsApp")}
            </a>
          )}
          <Link href={`/${locale}`} className="btn-secondary flex-1">
            {t("back")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="card space-y-5">
      <div className="flex items-start justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {kind === "express" ? t("expressTitle") : t("pickupTitle")}
        </h1>
        <Link
          href={`/${locale}`}
          className="rounded-full p-2 text-ink-mute hover:bg-paper-soft dark:hover:bg-ink-mute"
          title={t("back")}
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>
      </div>

      <div className="space-y-3 rounded-2xl bg-paper-soft p-4 text-sm dark:bg-ink-mute">
        <div>
          <div className="font-semibold leading-tight">{part.name}</div>
          <div className="mt-1 text-xs text-ink-mute dark:text-paper-mute">
            {part.brand} · {part.article}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-paper-mute/60 pt-3 dark:border-ink/40">
          <div>
            <div className="text-xs text-ink-mute dark:text-paper-mute">
              Цена за шт.
            </div>
            <div className="font-bold">{fmt(part.price)} ₸</div>
          </div>

          <div>
            <div className="mb-1 text-xs text-ink-mute dark:text-paper-mute">
              Количество (в наличии: {part.availableQty} шт)
            </div>
            <div className="inline-flex items-center overflow-hidden rounded-2xl border border-paper-mute dark:border-ink">
              <button
                type="button"
                onClick={() => setQty(qty - 1)}
                disabled={qty <= 1}
                className="flex h-10 w-10 items-center justify-center text-ink-mute disabled:opacity-40 hover:bg-paper dark:text-paper-mute dark:hover:bg-ink"
                aria-label="−"
              >
                <Minus className="h-4 w-4" />
              </button>
              <input
                type="number"
                min={1}
                max={part.availableQty}
                {...register("quantity", { valueAsNumber: true })}
                className="h-10 w-14 border-x border-paper-mute bg-transparent text-center text-base font-bold outline-none dark:border-ink"
              />
              <button
                type="button"
                onClick={() => setQty(qty + 1)}
                disabled={qty >= part.availableQty}
                className="flex h-10 w-10 items-center justify-center text-ink-mute disabled:opacity-40 hover:bg-paper dark:text-paper-mute dark:hover:bg-ink"
                aria-label="+"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="text-right">
            <div className="text-xs text-ink-mute dark:text-paper-mute">Итого</div>
            <div className="text-2xl font-black text-brand">
              {fmt(total)} <span className="text-sm font-semibold">₸</span>
            </div>
          </div>
        </div>
      </div>

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
        <Link href={`/${locale}`} className="btn-secondary flex-1">
          {t("back")}
        </Link>
      </div>
    </form>
  );
}
