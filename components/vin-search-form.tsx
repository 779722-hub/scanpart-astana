"use client";

import { useEffect, useState } from "react";
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

type Status = "idle" | "loading" | "error" | "ok" | "manual";

export function VinSearchForm({ locale }: { locale: string }) {
  const t = useTranslations("vin");
  const tArt = useTranslations("article");
  const tName = useTranslations("name");
  const [vin, setVin] = useState("");
  const [status, setStatus] = useState<Status>("idle");
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

  function onManualSubmitted(v: Vehicle) {
    setVehicle(v);
    setStatus("ok");
  }

  if (status === "manual") {
    return (
      <ManualForm
        onCancel={reset}
        onDone={onManualSubmitted}
        labels={{
          title: t("manualTitle"),
          hint: t("manualHint"),
          make: t("manualMake"),
          model: t("manualModel"),
          year: t("manualYear"),
          save: t("manualSave"),
          cancel: t("confirmEdit"),
        }}
      />
    );
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
              <div className="text-ink-mute dark:text-paper-mute">{vehicle.year}</div>
            </div>
          </div>
        </div>
        <div className="card space-y-4">
          <p className="text-pretty text-ink-mute dark:text-paper-mute">
            {tArt("continueHint")}
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link href={`/${locale}/search/article`} className="btn-primary flex-1">
              {tArt("title")}
              <ChevronRight className="h-4 w-4" />
            </Link>
            <Link href={`/${locale}/search/name`} className="btn-secondary flex-1">
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
        <label className="label" htmlFor="vin">VIN</label>
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
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primary flex-1" disabled={status === "loading"}>
          {status === "loading" ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> …</>
          ) : (
            t("submit")
          )}
        </button>
        <button
          type="button"
          onClick={() => setStatus("manual")}
          className="btn-secondary"
        >
          {t("manualOpen")}
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

interface ManualLabels {
  title: string;
  hint: string;
  make: string;
  model: string;
  year: string;
  save: string;
  cancel: string;
}

function ManualForm({
  onDone,
  onCancel,
  labels,
}: {
  onDone: (v: Vehicle) => void;
  onCancel: () => void;
  labels: ManualLabels;
}) {
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [saving, setSaving] = useState(false);
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: currentYear - 1979 }, (_, i) => currentYear - i);

  // Auto-load models from NHTSA when make has stabilized for 400 ms.
  useEffect(() => {
    const m = make.trim();
    if (!m || m.length < 2) {
      setModels([]);
      return;
    }
    let cancelled = false;
    const handle = setTimeout(async () => {
      setLoadingModels(true);
      try {
        const res = await fetch(`/api/vin/models?make=${encodeURIComponent(m)}`);
        const json = await res.json();
        if (!cancelled && json.ok) setModels(json.models as string[]);
      } catch {
        /* keep previous list */
      } finally {
        if (!cancelled) setLoadingModels(false);
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [make]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!make.trim()) return;
    setSaving(true);
    try {
      const v: Vehicle = {
        make: make.trim(),
        model: model.trim() || "—",
        year: year || "—",
      };
      const syntheticVin = "MANUAL00000000000".slice(0, 17);
      await fetch("/api/session/vin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ vin: syntheticVin, vehicle: v }),
      });
      onDone(v);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="card space-y-4">
      <h2 className="text-2xl font-bold tracking-tight">{labels.title}</h2>
      <p className="text-sm text-ink-mute dark:text-paper-mute">{labels.hint}</p>

      <div>
        <label className="label">{labels.make}</label>
        <input
          list="known-makes"
          className="input"
          value={make}
          onChange={(e) => setMake(e.target.value)}
          placeholder="Toyota"
          required
          autoFocus
        />
        <datalist id="known-makes">
          {KNOWN_MAKES.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="label flex items-center gap-2">
            {labels.model}
            {loadingModels && <Loader2 className="h-3 w-3 animate-spin text-ink-mute" />}
          </label>
          <input
            list="models-list"
            className="input"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder={models.length ? "Camry" : "—"}
            disabled={!make}
          />
          <datalist id="models-list">
            {models.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </div>
        <div>
          <label className="label">{labels.year}</label>
          <select
            className="input"
            value={year}
            onChange={(e) => setYear(e.target.value)}
          >
            <option value="">—</option>
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex gap-3">
        <button className="btn-primary flex-1" disabled={saving || !make.trim()}>
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <><Save className="h-4 w-4" /> {labels.save}</>
          )}
        </button>
        <button type="button" onClick={onCancel} className="btn-secondary">
          {labels.cancel}
        </button>
      </div>
    </form>
  );
}
