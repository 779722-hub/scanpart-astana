"use client";

import { useEffect, useState } from "react";
import { Loader2, Warehouse as WarehouseIcon, Save, Trash2, Plus, MapPin } from "lucide-react";
import { parseLatLngPair } from "@/lib/delivery/warehouse";

interface Warehouse {
  id: string;
  name: string;
  address: string;
  lat: number | null;
  lng: number | null;
  pickupMinutes: number;
  active: boolean;
  sourceCode: string;
  color: string;
  markup: number | null;
}

type Draft = {
  id?: string;
  name: string;
  address: string;
  lat: string;
  lng: string;
  pickupMinutes: string;
  active: boolean;
  sourceCode: string;
  color: string;
  markup: string;
};

const DEFAULT_COLOR = "#F59E0B";
const empty: Draft = { name: "", address: "", lat: "", lng: "", pickupMinutes: "15", active: true, sourceCode: "", color: DEFAULT_COLOR, markup: "" };
// Quick-pick palette (manager can also open the native picker for any colour).
const COLOR_PRESETS = ["#F59E0B", "#EA580C", "#2563EB", "#16A34A", "#DC2626", "#7C3AED", "#0891B2", "#DB2777"];

export function TabWarehouses() {
  const [rows, setRows] = useState<Warehouse[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [geo, setGeo] = useState(false);

  async function geocode() {
    if (!draft?.address.trim()) return;
    setGeo(true);
    try {
      const j = await fetch(`/api/admin/geocode?q=${encodeURIComponent(draft.address)}`).then((r) => r.json());
      if (j.ok) {
        setDraft((d) => (d ? { ...d, lat: String(j.lat), lng: String(j.lng) } : d));
      } else {
        alert(
          j.error === "not_found"
            ? "Адрес не найден — уточните его или впишите координаты вручную из 2ГИС."
            : "Геокодер недоступен, впишите координаты вручную."
        );
      }
    } finally {
      setGeo(false);
    }
  }

  async function refresh() {
    const j = await fetch("/api/admin/warehouses").then((r) => r.json());
    setRows(j.ok ? j.warehouses : []);
  }
  useEffect(() => {
    refresh();
  }, []);

  async function save() {
    if (!draft) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/warehouses", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: draft.id,
          name: draft.name,
          address: draft.address,
          lat: draft.lat,
          lng: draft.lng,
          pickupMinutes: draft.pickupMinutes,
          active: draft.active,
          sourceCode: draft.sourceCode,
          color: draft.color,
          markup: draft.markup,
        }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) {
        alert(
          j.error === "name_required"
            ? "Укажите название склада"
            : j.error === "bad_lat" || j.error === "bad_lng"
              ? "Неверные координаты"
              : `Ошибка: ${j.error}`
        );
        return;
      }
      setDraft(null);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Удалить склад?")) return;
    await fetch("/api/admin/warehouses", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    });
    refresh();
  }

  if (!rows) {
    return (
      <div className="card flex justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="card space-y-1">
        <div className="flex items-center gap-2 text-base font-bold">
          <WarehouseIcon className="h-5 w-5 text-brand" /> Склады (точки получения)
        </div>
        <p className="text-sm text-ink-mute dark:text-paper-mute">
          Точки, откуда курьер забирает заказы. Координаты нужны для построения
          маршрута. Скопируйте их из 2ГИС/Google Карт (правый клик на точке →
          координаты) и вставьте в поле «Координаты».
        </p>
      </div>

      {rows.map((w) => (
        <div key={w.id} className="card flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 font-bold">
              <span className="inline-block h-3 w-3 flex-none rounded-full ring-1 ring-black/20" style={{ background: w.color || DEFAULT_COLOR }} />
              {w.name}
              {w.sourceCode && (
                <span className="rounded-full bg-brand/10 px-2 py-0.5 text-xs font-semibold text-brand">
                  {w.sourceCode}
                </span>
              )}
              {w.markup != null && (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200">
                  наценка {w.markup}%
                </span>
              )}
              {!w.active && (
                <span className="rounded-full bg-paper-soft px-2 py-0.5 text-xs text-ink-mute dark:bg-ink-mute">
                  выключен
                </span>
              )}
            </div>
            <div className="text-sm text-ink-mute dark:text-paper-mute">{w.address || "—"}</div>
            <div className="mt-1 flex flex-wrap gap-3 text-xs text-ink-mute dark:text-paper-mute">
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {w.lat != null && w.lng != null ? `${w.lat}, ${w.lng}` : "нет координат"}
              </span>
              <span>получение ~{w.pickupMinutes} мин</span>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              className="btn-secondary !px-3 !py-2 text-sm"
              onClick={() =>
                setDraft({
                  id: w.id,
                  name: w.name,
                  address: w.address,
                  lat: w.lat?.toString() ?? "",
                  lng: w.lng?.toString() ?? "",
                  pickupMinutes: String(w.pickupMinutes),
                  active: w.active,
                  sourceCode: w.sourceCode ?? "",
                  color: w.color ?? DEFAULT_COLOR,
                  markup: w.markup != null ? String(w.markup) : "",
                })
              }
            >
              Изменить
            </button>
            <button
              className="btn-secondary !px-3 !py-2 text-sm text-brand"
              onClick={() => remove(w.id)}
              title="Удалить"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}

      {draft ? (
        <div className="card space-y-3">
          <div className="text-base font-bold">{draft.id ? "Изменить склад" : "Новый склад"}</div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Название</label>
              <input className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </div>
            <div>
              <label className="label">Время получения, мин</label>
              <input
                className="input"
                inputMode="numeric"
                value={draft.pickupMinutes}
                onChange={(e) => setDraft({ ...draft, pickupMinutes: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Источник (код склада в заказе)</label>
              <input
                className="input"
                placeholder="Р1, М2, Т4…"
                value={draft.sourceCode}
                onChange={(e) => setDraft({ ...draft, sourceCode: e.target.value })}
              />
              <p className="mt-1 text-xs text-ink-mute dark:text-paper-mute">
                Любой код из заказа (Р1, М2, Т4, Т5…) — тогда доставка из заказа сама подставит этот склад.
              </p>
            </div>
            <div>
              <label className="label">Наценка склада, % (пусто = общая)</label>
              <input
                className="input"
                inputMode="numeric"
                placeholder="напр. 30"
                value={draft.markup}
                onChange={(e) => setDraft({ ...draft, markup: e.target.value })}
              />
              <p className="mt-1 text-xs text-ink-mute dark:text-paper-mute">
                Переопределяет общую наценку для этого склада (10–200). Пусто —
                применяется общая наценка из «Настроек».
              </p>
            </div>
          </div>
          <div>
            <label className="label">Цвет точки на карте</label>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="color"
                className="h-9 w-12 cursor-pointer rounded-lg border border-paper-mute bg-transparent dark:border-ink"
                value={draft.color}
                onChange={(e) => setDraft({ ...draft, color: e.target.value })}
              />
              {COLOR_PRESETS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setDraft({ ...draft, color: c })}
                  className={`h-7 w-7 rounded-full ring-1 ring-black/20 ${draft.color.toLowerCase() === c.toLowerCase() ? "ring-2 ring-offset-2 ring-brand" : ""}`}
                  style={{ background: c }}
                  title={c}
                />
              ))}
            </div>
          </div>
          <div>
            <label className="label">Адрес</label>
            <input className="input" value={draft.address} onChange={(e) => setDraft({ ...draft, address: e.target.value })} />
          </div>
          <div>
            <label className="label">Координаты (широта, долгота)</label>
            <div className="flex gap-2">
              <input
                className="input flex-1"
                placeholder="51.1605, 71.4704"
                value={draft.lat && draft.lng ? `${draft.lat}, ${draft.lng}` : draft.lat || draft.lng || ""}
                onChange={(e) => {
                  const { lat, lng } = parseLatLngPair(e.target.value);
                  setDraft({ ...draft, lat: lat?.toString() ?? "", lng: lng?.toString() ?? "" });
                }}
              />
              <button
                type="button"
                className="btn-secondary !px-3 !py-2 text-sm whitespace-nowrap"
                onClick={geocode}
                disabled={geo || !draft.address.trim()}
                title="Определить координаты по адресу"
              >
                {geo ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
                По адресу
              </button>
            </div>
            <p className="mt-1 text-xs text-ink-mute dark:text-paper-mute">
              Заполните адрес выше и нажмите «По адресу», либо вставьте координаты из 2ГИС вручную.
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />
            Активен (используется в маршрутах)
          </label>
          <div className="flex justify-end gap-2">
            <button className="btn-secondary !px-4 !py-2 text-sm" onClick={() => setDraft(null)}>
              Отмена
            </button>
            <button className="btn-primary !px-4 !py-2 text-sm" onClick={save} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Сохранить
            </button>
          </div>
        </div>
      ) : (
        <button className="btn-secondary" onClick={() => setDraft({ ...empty })}>
          <Plus className="h-4 w-4" /> Добавить склад
        </button>
      )}
    </div>
  );
}
