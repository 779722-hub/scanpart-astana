"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, ChevronLeft, CheckCircle2, ExternalLink } from "lucide-react";
import { orderSchema, type OrderInput } from "@/lib/schemas";

export interface SelectedPart {
  brand: string;
  article: string;
  name: string;
  price: number;
  quantity: number;
}

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
    formState: { errors },
  } = useForm<OrderInput>({
    resolver: zodResolver(orderSchema),
    defaultValues: {
      kind,
      brand: part.brand,
      article: part.article,
      partName: part.name,
      price: part.price,
      quantity: part.quantity,
    },
  });

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

      <div className="rounded-2xl bg-paper-soft px-4 py-3 text-sm dark:bg-ink-mute">
        <div className="font-semibold">{part.name}</div>
        <div className="text-ink-mute dark:text-paper-mute">
          {part.brand} · {part.article} ·{" "}
          <strong>
            {new Intl.NumberFormat("ru-RU").format(part.price)} ₸
          </strong>{" "}
          × {part.quantity}
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
            placeholder="+7 (7__) ___-__-__"
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
            placeholder="+7 (7__) ___-__-__"
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
