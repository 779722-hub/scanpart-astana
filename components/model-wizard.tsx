"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Car, ChevronRight, ArrowLeft, Check } from "lucide-react";
import { TechpassScanButton } from "./techpass-scan";

interface Brand {
  code: string;
  brand: string;
  name: string;
}
interface WizardField {
  name: string;
  determined: boolean;
  automatic: boolean;
  allowListVehicles: boolean;
  value?: string;
  options: Array<{ key: string; value: string }>;
}
interface WizVehicle {
  vehicleId: number;
  brand: string;
  name: string;
  engine: string;
  market: string;
  ssd: string;
  catalog: string;
}

const selectCls = "input";

/**
 * By-model catalog wizard (no VIN). Brand → cascading parameters (market /
 * model / year / drive / engine …) → list of matching modifications → pick one,
 * which sets the current vehicle so name search runs against the real catalog.
 */
export function ModelWizard({
  locale,
  onCancel,
  ocrEnabled = false,
  onVin,
}: {
  locale: string;
  onCancel: () => void;
  ocrEnabled?: boolean;
  onVin?: (vin: string) => void;
}) {
  const [brands, setBrands] = useState<Brand[] | null>(null);
  const [catalogId, setCatalogId] = useState("");
  const [ssd, setSsd] = useState("");
  const [field, setField] = useState<WizardField | null>(null);
  const [allowList, setAllowList] = useState(false);
  const [chosen, setChosen] = useState<Array<{ name: string; value: string }>>([]);
  const [vehicles, setVehicles] = useState<WizVehicle[] | null>(null);
  const [picked, setPicked] = useState<WizVehicle | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  useEffect(() => {
    fetch("/api/catalog/brands")
      .then((r) => r.json())
      .then((j) => setBrands(j.ok ? j.brands : []))
      .catch(() => setBrands([]));
  }, []);

  async function loadStep(catId: string, nextSsd: string) {
    setBusy(true);
    setError("");
    try {
      const j = await fetch(
        `/api/catalog/wizard?catalogId=${encodeURIComponent(catId)}&ssd=${encodeURIComponent(nextSsd)}`
      ).then((r) => r.json());
      const fields: WizardField[] = j.fields ?? [];
      const next = fields.find((f) => !f.determined && (f.options?.length ?? 0) > 0) ?? null;
      setField(next);
      setAllowList(fields.some((f) => f.allowListVehicles));
      setSsd(nextSsd);
    } catch {
      setError("Сервис каталога недоступен, попробуйте позже.");
    } finally {
      setBusy(false);
    }
  }

  function pickBrand(code: string) {
    setCatalogId(code);
    setChosen([]);
    setVehicles(null);
    setField(null);
    setAllowList(false);
    if (code) loadStep(code, "");
  }

  function pickOption(value: string, key: string) {
    if (field) setChosen((c) => [...c, { name: field.name, value }]);
    loadStep(catalogId, key);
  }

  async function showVehicles() {
    setBusy(true);
    setError("");
    try {
      const j = await fetch(
        `/api/catalog/vehicles?catalogId=${encodeURIComponent(catalogId)}&ssd=${encodeURIComponent(ssd)}`
      ).then((r) => r.json());
      setVehicles(j.vehicles ?? []);
      if (!j.vehicles?.length) setError("Модификации не найдены — уточните параметры выше.");
    } catch {
      setError("Сервис каталога недоступен.");
    } finally {
      setBusy(false);
    }
  }

  async function choose(v: WizVehicle) {
    setBusy(true);
    try {
      const year = chosen.find((c) => c.name.toLowerCase().includes("год"))?.value ?? "";
      await fetch("/api/session/vehicle", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          vehicleId: v.vehicleId,
          catalog: v.catalog,
          ssd: v.ssd,
          make: v.brand,
          model: v.name,
          year,
        }),
      });
      setPicked(v);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  // Done — car is set; offer both search types (same as the VIN chooser).
  if (picked) {
    return (
      <div className="space-y-6">
        <div className="card">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 flex-none items-center justify-center rounded-2xl bg-brand text-white">
              <Check className="h-7 w-7" />
            </div>
            <div>
              <div className="text-sm text-ink-mute dark:text-paper-mute">Выбран автомобиль</div>
              <div className="text-2xl font-bold">
                {picked.brand} {picked.name}
              </div>
              <div className="text-ink-mute dark:text-paper-mute">
                {[picked.engine, picked.market].filter(Boolean).join(" · ")}
              </div>
            </div>
          </div>
        </div>
        <div className="card space-y-4">
          <p className="text-ink-mute dark:text-paper-mute">
            Теперь ищите запчасти — они будут подобраны из каталога именно для этого авто.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link href={`/${locale}/search/article`} className="btn-primary flex-1">
              По парт-номеру <ChevronRight className="h-4 w-4" />
            </Link>
            <Link href={`/${locale}/search/name`} className="btn-secondary flex-1">
              По названию
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card space-y-5">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold tracking-tight">Подбор по марке и модели</h1>
        <button onClick={onCancel} className="inline-flex items-center gap-1 text-sm text-ink-mute dark:text-paper-mute underline">
          <ArrowLeft className="h-4 w-4" /> Назад
        </button>
      </div>

      {ocrEnabled && onVin && (
        <div className="space-y-1 rounded-2xl bg-paper-soft p-3 dark:bg-ink-mute">
          <TechpassScanButton onVin={onVin} />
          <p className="text-center text-xs text-ink-mute dark:text-paper-mute">
            Знаете VIN? Сфотографируйте техпаспорт или загрузите готовое фото —
            марка определится сама
          </p>
        </div>
      )}

      {/* Breadcrumb of chosen parameters */}
      {(catalogId || chosen.length > 0) && (
        <div className="flex flex-wrap gap-1.5 text-xs">
          {brands?.find((b) => b.code === catalogId) && (
            <span className="rounded-2xl bg-brand/10 px-2 py-1 font-semibold text-brand">
              {brands.find((b) => b.code === catalogId)!.name}
            </span>
          )}
          {chosen.map((c, i) => (
            <span key={i} className="rounded-2xl bg-paper-soft px-2 py-1 dark:bg-ink-mute">
              {c.value}
            </span>
          ))}
        </div>
      )}

      {/* Brand */}
      <div>
        <label className="label">Марка</label>
        {brands === null ? (
          <div className="flex h-11 items-center"><Loader2 className="h-4 w-4 animate-spin" /></div>
        ) : (
          <select
            className={selectCls}
            value={catalogId}
            onChange={(e) => pickBrand(e.target.value)}
          >
            <option value="">— выберите марку —</option>
            {brands.map((b) => (
              <option key={b.code} value={b.code}>{b.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* Current cascading field */}
      {catalogId && vehicles === null && (
        <>
          {busy && !field ? (
            <div className="flex items-center gap-2 text-sm text-ink-mute dark:text-paper-mute">
              <Loader2 className="h-4 w-4 animate-spin" /> Загрузка…
            </div>
          ) : field ? (
            <div>
              <label className="label">{field.name}</label>
              <select
                className={selectCls}
                value=""
                onChange={(e) => {
                  const opt = field.options.find((o) => o.key === e.target.value);
                  if (opt) pickOption(opt.value, opt.key);
                }}
                disabled={busy}
              >
                <option value="">— выберите —</option>
                {field.options.map((o) => (
                  <option key={o.key} value={o.key}>{o.value}</option>
                ))}
              </select>
            </div>
          ) : null}

          {allowList && (
            <button onClick={showVehicles} disabled={busy} className="btn-primary w-full">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Car className="h-4 w-4" />}
              Показать автомобили
            </button>
          )}
        </>
      )}

      {/* Vehicle modifications */}
      {vehicles && (
        <div className="space-y-2">
          <div className="text-sm font-semibold">Выберите модификацию:</div>
          {vehicles.map((v) => (
            <button
              key={v.vehicleId}
              onClick={() => choose(v)}
              disabled={busy}
              className="flex w-full items-center justify-between gap-2 rounded-2xl border border-paper-mute bg-white p-3 text-left transition hover:border-brand dark:border-ink dark:bg-ink-soft"
            >
              <span className="flex items-center gap-2">
                <Car className="h-4 w-4 flex-none text-brand" />
                <span className="font-semibold">
                  {v.brand} {v.name}
                  <span className="ml-1 font-normal text-ink-mute dark:text-paper-mute">
                    {[v.engine, v.market].filter(Boolean).join(" · ")}
                  </span>
                </span>
              </span>
              <ChevronRight className="h-4 w-4 flex-none text-ink-mute dark:text-paper-mute" />
            </button>
          ))}
          <button
            onClick={() => setVehicles(null)}
            className="text-sm text-ink-mute dark:text-paper-mute underline"
          >
            ← Уточнить параметры
          </button>
        </div>
      )}

      {error && (
        <div className="rounded-2xl bg-brand/10 px-4 py-3 text-sm text-brand">{error}</div>
      )}
    </div>
  );
}
