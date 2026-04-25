"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Car, ChevronRight, RotateCcw, Save } from "lucide-react";
import Link from "next/link";

interface Vehicle {
  make: string;
  model: string;
  year: string;
}

const KNOWN_MAKES = [
  "Audi", "BMW", "Chevrolet", "Citroen", "Fiat", "Ford", "Honda", "Hyundai",
  "Infiniti", "Jaguar", "Jeep", "Kia", "Land Rover", "Lexus", "Mazda",
  "Mercedes-Benz", "Mitsubishi", "Nissan", "Opel", "Peugeot", "Porsche",
  "Renault", "Skoda", "Subaru", "Suzuki", "Toyota", "Volkswagen", "Volvo",
  "Lada", "UAZ", "Chery", "Geely", "Haval",
];

export function VinSearchForm({ locale }: { locale: string }) {
  const t = useTranslations("vin");
  const tArt = useTranslations("article");
  const tName = useTranslations("name");
  const [vin, setVin] = useState("");
  const [status, setStatus] = useState<
    "idle" | "loading" | "error" | "ok" | "manual"
  >("idle");
  const [errorKind, setErrorKind] =
    useState<"invalid" | "notFound" | "generic">("invalid");
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [manualMake, setManualMake] = useState("");
  const [manualModel, setManualModel] = useState("");
  const [manualYear, setManualYear] = useState("");
  const [savingManual, setSavingManual] = useState(false);

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
    setManualMake("");
    setManualModel("");
    setManualYear("");
  }

  async function submitManual(e: React.FormEvent) {
    e.preventDefault();
    if (!manualMake) return;
    setSavingManual(true);
    try {
      const v: Vehicle = {
        make: manualMake,
        model: manualModel || "—",
        year: manualYear || "—",
      };
      // Use a synthetic VIN of 17 chars to satisfy the API; real VIN unknown.
      const syntheticVin = "MANUAL00000000000".slice(0, 17);
      await fetch("/api/session/vin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ vin: syntheticVin, vehicle: v }),
      });
      setVehicle(v);
      setStatus("ok");
    } finally {
      setSavingManual(false);
    }
  }

  if (status === "manual") return <ManualForm />;

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
        <div className="space-y-3">
          <div className="rounded-2xl bg-brand/10 px-4 py-3 text-sm font-medium text-brand">
            {errorKind === "invalid" ? t("invalid") : t("notFound")}
          </div>
          {errorKind === "notFound" && (
            <button
              type="button"
              onClick={() => setStatus("manual")}
              className="btn-secondary w-full"
            >
              {t("manualOpen")}
            </button>
          )}
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

  function ManualForm() {
    return (
      <form onSubmit={submitManual} className="card space-y-4">
        <h2 className="text-2xl font-bold tracking-tight">{t("manualTitle")}</h2>
        <p className="text-sm text-ink-mute dark:text-paper-mute">
          {t("manualHint")}
        </p>
        <div>
          <label className="label">{t("manualMake")}</label>
          <input
            list="known-makes"
            className="input"
            value={manualMake}
            onChange={(e) => setManualMake(e.target.value)}
            placeholder="Toyota"
            required
          />
          <datalist id="known-makes">
            {KNOWN_MAKES.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="label">{t("manualModel")}</label>
            <input
              className="input"
              value={manualModel}
              onChange={(e) => setManualModel(e.target.value)}
              placeholder="Camry"
            />
          </div>
          <div>
            <label className="label">{t("manualYear")}</label>
            <input
              className="input"
              type="number"
              min={1980}
              max={new Date().getFullYear() + 1}
              value={manualYear}
              onChange={(e) => setManualYear(e.target.value)}
              placeholder="2018"
            />
          </div>
        </div>
        <div className="flex gap-3">
          <button className="btn-primary flex-1" disabled={savingManual || !manualMake}>
            {savingManual ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Save className="h-4 w-4" /> {t("manualSave")}
              </>
            )}
          </button>
          <button type="button" onClick={reset} className="btn-secondary">
            {t("confirmEdit")}
          </button>
        </div>
      </form>
    );
  }
}
