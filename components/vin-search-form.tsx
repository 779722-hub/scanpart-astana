"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Car, ChevronRight, RotateCcw } from "lucide-react";
import Link from "next/link";

interface Vehicle {
  make: string;
  model: string;
  year: string;
}

export function VinSearchForm({ locale }: { locale: string }) {
  const t = useTranslations("vin");
  const tArt = useTranslations("article");
  const tName = useTranslations("name");
  const [vin, setVin] = useState("");
  const [status, setStatus] = useState<
    "idle" | "loading" | "error" | "ok"
  >("idle");
  const [errorKind, setErrorKind] =
    useState<"invalid" | "notFound" | "generic">("invalid");
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    try {
      const res = await fetch(`/api/vin?vin=${encodeURIComponent(vin)}`);
      const json = await res.json();
      if (res.ok && json.ok) {
        setVehicle(json.vehicle);
        setStatus("ok");
        // persist to session
        await fetch("/api/session/vin", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ vin: json.vin, vehicle: json.vehicle }),
        });
      } else {
        setErrorKind(json.error === "invalid_format" ? "invalid" : "notFound");
        setStatus("error");
      }
    } catch {
      setErrorKind("generic");
      setStatus("error");
    }
  }

  function reset() {
    setVin("");
    setVehicle(null);
    setStatus("idle");
  }

  if (status === "ok" && vehicle) {
    return (
      <div className="space-y-6">
        <div className="card">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand text-white">
              <Car className="h-7 w-7" />
            </div>
            <div>
              <div className="text-sm text-ink-mute dark:text-paper-mute">
                {t("confirmTitle")}
              </div>
              <div className="text-2xl font-bold">
                {vehicle.make} {vehicle.model}
              </div>
              <div className="text-ink-mute dark:text-paper-mute">
                {vehicle.year}
              </div>
            </div>
          </div>
        </div>

        <div className="card space-y-4">
          <p className="text-pretty text-ink-mute dark:text-paper-mute">
            {tArt("continueHint")}
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href={`/${locale}/search/article`}
              className="btn-primary flex-1"
            >
              {tArt("title")}
              <ChevronRight className="h-4 w-4" />
            </Link>
            <Link
              href={`/${locale}/search/name`}
              className="btn-secondary flex-1"
            >
              {tName("title")}
            </Link>
          </div>
          <button onClick={reset} className="text-sm text-ink-mute underline">
            {t("confirmEdit")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="card space-y-5">
      <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
      <p className="text-ink-mute dark:text-paper-mute">{t("hint")}</p>
      <div>
        <label className="label" htmlFor="vin">
          VIN
        </label>
        <input
          id="vin"
          className="input uppercase tracking-[0.2em]"
          placeholder={t("placeholder")}
          value={vin}
          onChange={(e) => setVin(e.target.value.toUpperCase())}
          maxLength={17}
          autoComplete="off"
          required
          disabled={status === "loading"}
        />
      </div>
      {status === "error" && (
        <div className="rounded-2xl bg-brand/10 px-4 py-3 text-sm font-medium text-brand">
          {errorKind === "invalid" ? t("invalid") : t("notFound")}
        </div>
      )}
      <div className="flex items-center gap-3">
        <button className="btn-primary flex-1" disabled={status === "loading"}>
          {status === "loading" ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> …
            </>
          ) : (
            t("submit")
          )}
        </button>
        <button
          type="button"
          onClick={reset}
          className="btn-secondary"
          title={t("confirmEdit")}
        >
          <RotateCcw className="h-4 w-4" />
        </button>
      </div>
    </form>
  );
}
