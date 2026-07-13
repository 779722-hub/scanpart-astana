"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Truck, Save, Trash2, Plus, MapPin, Route as RouteIcon, Radio } from "lucide-react";
import { STATUS_LABEL_RU, type DeliveryStatus } from "@/lib/delivery/types";
import { parseLatLngPair } from "@/lib/delivery/warehouse";
import { agoLabel, isStale } from "@/lib/delivery/live";

interface Delivery {
  id: string;
  customerName: string;
  phone: string;
  whatsapp: string;
  address: string;
  lat: number | null;
  lng: number | null;
  items: string;
  warehouseIds: string[];
  courierId: string;
  status: DeliveryStatus;
}
interface Courier { id: string; name: string }
interface Warehouse { id: string; name: string }
interface RouteStop { kind: "pickup" | "dropoff"; label: string; etaMinutes: number; legKm: number }

type Draft = Omit<Delivery, "lat" | "lng" | "status"> & { latlng: string; status?: DeliveryStatus };

const emptyDraft: Draft = {
  id: "", customerName: "", phone: "", whatsapp: "", address: "", latlng: "",
  items: "", warehouseIds: [], courierId: "",
};

const STATUS_COLOR: Record<DeliveryStatus, string> = {
  new: "bg-paper-soft text-ink-mute dark:bg-ink-mute",
  assigned: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-200",
  picking: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-200",
  en_route: "bg-brand/10 text-brand",
  delivered: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200",
  canceled: "bg-paper-soft text-ink-mute line-through dark:bg-ink-mute",
};

export function TabDeliveries() {
  const [rows, setRows] = useState<Delivery[] | null>(null);
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [routeCourier, setRouteCourier] = useState("");
  const [route, setRoute] = useState<{ stops: RouteStop[]; totalKm: number; totalMinutes: number } | null>(null);

  async function refresh() {
    const [d, c, w] = await Promise.all([
      fetch("/api/admin/deliveries").then((r) => r.json()),
      fetch("/api/admin/couriers").then((r) => r.json()),
      fetch("/api/admin/warehouses").then((r) => r.json()),
    ]);
    setRows(d.ok ? d.deliveries : []);
    setCouriers(c.ok ? c.couriers : []);
    setWarehouses(w.ok ? w.warehouses : []);
  }
  useEffect(() => {
    refresh();
  }, []);

  const courierName = useMemo(() => {
    const m = new Map(couriers.map((c) => [c.id, c.name]));
    return (id: string) => m.get(id) || "—";
  }, [couriers]);

  async function save() {
    if (!draft) return;
    setBusy(true);
    try {
      const { lat, lng } = parseLatLngPair(draft.latlng);
      const res = await fetch("/api/admin/deliveries", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: draft.id || undefined,
          customerName: draft.customerName,
          phone: draft.phone,
          whatsapp: draft.whatsapp,
          address: draft.address,
          lat, lng,
          items: draft.items,
          warehouseIds: draft.warehouseIds,
          courierId: draft.courierId,
          status: draft.status,
        }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) {
        alert(`Ошибка: ${j.error}`);
        return;
      }
      setDraft(null);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Удалить доставку?")) return;
    await fetch("/api/admin/deliveries", {
      method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }),
    });
    refresh();
  }

  async function previewRoute(courierId: string) {
    setRouteCourier(courierId);
    setRoute(null);
    if (!courierId) return;
    const j = await fetch(`/api/admin/deliveries?courierId=${encodeURIComponent(courierId)}`).then((r) => r.json());
    setRoute(j.route ?? null);
  }

  function editFrom(d: Delivery) {
    setDraft({
      id: d.id, customerName: d.customerName, phone: d.phone, whatsapp: d.whatsapp,
      address: d.address, latlng: d.lat != null && d.lng != null ? `${d.lat}, ${d.lng}` : "",
      items: d.items, warehouseIds: d.warehouseIds, courierId: d.courierId, status: d.status,
    });
  }

  if (!rows) {
    return <div className="card flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  }

  const etaClock = (min: number) => {
    const d = new Date(Date.now() + min * 60000);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  return (
    <div className="space-y-4">
      <div className="card flex items-center gap-2 text-base font-bold">
        <Truck className="h-5 w-5 text-brand" /> Доставки
      </div>

      <LiveCouriers />

      {/* Route preview */}
      <div className="card space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <RouteIcon className="h-4 w-4 text-brand" />
          <span className="text-sm font-semibold">Маршрут курьера:</span>
          <select className="input max-w-[16rem]" value={routeCourier} onChange={(e) => previewRoute(e.target.value)}>
            <option value="">— выберите курьера —</option>
            {couriers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        {route && (
          route.stops.length === 0 ? (
            <p className="text-sm text-ink-mute dark:text-paper-mute">Нет активных доставок с координатами у этого курьера.</p>
          ) : (
            <div className="space-y-1">
              {route.stops.map((s, i) => (
                <div key={i} className="flex items-center justify-between gap-2 rounded-2xl bg-paper-soft px-3 py-2 text-sm dark:bg-ink-mute">
                  <span className="flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${s.kind === "pickup" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-200" : "bg-brand/10 text-brand"}`}>
                      {s.kind === "pickup" ? "Склад" : "Клиент"}
                    </span>
                    {s.label}
                  </span>
                  <span className="whitespace-nowrap text-ink-mute dark:text-paper-mute">~{etaClock(s.etaMinutes)} · {s.legKm} км</span>
                </div>
              ))}
              <div className="pt-1 text-right text-sm font-semibold">
                Итого ≈ {route.totalKm} км · {route.totalMinutes} мин
              </div>
            </div>
          )
        )}
      </div>

      {/* List */}
      {rows.map((d) => (
        <div key={d.id} className="card space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_COLOR[d.status]}`}>{STATUS_LABEL_RU[d.status]}</span>
              <span className="font-bold">{d.customerName || "—"}</span>
              <span className="text-sm text-ink-mute dark:text-paper-mute">{d.phone}</span>
            </div>
            <div className="flex gap-2">
              <button className="btn-secondary !px-3 !py-2 text-sm" onClick={() => editFrom(d)}>Изменить</button>
              <button className="btn-secondary !px-3 !py-2 text-sm text-brand" onClick={() => remove(d.id)}><Trash2 className="h-4 w-4" /></button>
            </div>
          </div>
          <div className="text-sm">{d.items}</div>
          <div className="flex flex-wrap gap-3 text-xs text-ink-mute dark:text-paper-mute">
            <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{d.address || "нет адреса"}{d.lat == null && " (нет координат)"}</span>
            <span>курьер: {d.courierId ? courierName(d.courierId) : "не назначен"}</span>
            {d.warehouseIds.length > 0 && <span>склады: {d.warehouseIds.length}</span>}
          </div>
        </div>
      ))}

      {/* Create / edit */}
      {draft ? (
        <div className="card space-y-3">
          <div className="text-base font-bold">{draft.id ? "Изменить доставку" : "Новая доставка"}</div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div><label className="label">Клиент</label><input className="input" value={draft.customerName} onChange={(e) => setDraft({ ...draft, customerName: e.target.value })} /></div>
            <div><label className="label">Телефон</label><input className="input" value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} /></div>
            <div><label className="label">WhatsApp</label><input className="input" value={draft.whatsapp} onChange={(e) => setDraft({ ...draft, whatsapp: e.target.value })} /></div>
            <div><label className="label">Координаты (широта, долгота)</label><input className="input" placeholder="51.16, 71.47" value={draft.latlng} onChange={(e) => setDraft({ ...draft, latlng: e.target.value })} /></div>
          </div>
          <div><label className="label">Адрес</label><input className="input" value={draft.address} onChange={(e) => setDraft({ ...draft, address: e.target.value })} /></div>
          <div><label className="label">Что везём</label><input className="input" value={draft.items} onChange={(e) => setDraft({ ...draft, items: e.target.value })} placeholder="Колодки, фильтр…" /></div>
          <div>
            <label className="label">Забрать со складов</label>
            <div className="flex flex-wrap gap-2">
              {warehouses.map((w) => {
                const on = draft.warehouseIds.includes(w.id);
                return (
                  <button key={w.id} type="button"
                    onClick={() => setDraft({ ...draft, warehouseIds: on ? draft.warehouseIds.filter((x) => x !== w.id) : [...draft.warehouseIds, w.id] })}
                    className={`rounded-2xl border px-3 py-1.5 text-sm ${on ? "border-brand bg-brand/10 text-brand" : "border-paper-mute dark:border-ink"}`}>
                    {w.name}
                  </button>
                );
              })}
              {warehouses.length === 0 && <span className="text-sm text-ink-mute">Сначала добавьте склады во вкладке «Склады».</span>}
            </div>
          </div>
          <div>
            <label className="label">Курьер</label>
            <select className="input" value={draft.courierId} onChange={(e) => setDraft({ ...draft, courierId: e.target.value })}>
              <option value="">— не назначен —</option>
              {couriers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <button className="btn-secondary !px-4 !py-2 text-sm" onClick={() => setDraft(null)}>Отмена</button>
            <button className="btn-primary !px-4 !py-2 text-sm" onClick={save} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Сохранить
            </button>
          </div>
        </div>
      ) : (
        <button className="btn-secondary" onClick={() => setDraft({ ...emptyDraft })}>
          <Plus className="h-4 w-4" /> Добавить доставку
        </button>
      )}
    </div>
  );
}

interface LiveCourier {
  id: string;
  name: string;
  phone: string;
  activeCount: number;
  enRoute: number;
  location: { lat: number; lng: number; updatedAt: string } | null;
}

function LiveCouriers() {
  const [rows, setRows] = useState<LiveCourier[] | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/admin/live")
        .then((r) => r.json())
        .then((j) => {
          if (alive) {
            setRows(j.ok ? j.couriers : []);
            setNow(Date.now());
          }
        })
        .catch(() => {});
    load();
    const t = setInterval(load, 20000); // refresh every 20s
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  if (!rows || rows.length === 0) return null;

  return (
    <div className="card space-y-2">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Radio className="h-4 w-4 text-brand" /> Курьеры на линии
      </div>
      {rows.map((c) => (
        <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-paper-soft px-3 py-2 text-sm dark:bg-ink-mute">
          <span className="flex items-center gap-2">
            <span className="font-semibold">{c.name}</span>
            {c.enRoute > 0 && <span className="rounded-full bg-brand/10 px-2 py-0.5 text-xs font-semibold text-brand">в пути: {c.enRoute}</span>}
            <span className="text-ink-mute dark:text-paper-mute">доставок: {c.activeCount}</span>
          </span>
          <span className="flex items-center gap-2">
            {c.location ? (
              <>
                <span className={isStale(c.location.updatedAt, now) ? "text-ink-mute dark:text-paper-mute" : "text-emerald-600"}>
                  {agoLabel(c.location.updatedAt, now)}
                </span>
                <a
                  href={`https://2gis.kz/geo/${c.location.lng},${c.location.lat}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-semibold text-brand"
                >
                  <MapPin className="h-3.5 w-3.5" /> на карте
                </a>
              </>
            ) : (
              <span className="text-ink-mute dark:text-paper-mute">нет геопозиции</span>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}
