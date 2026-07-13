"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Truck, Save, Trash2, Plus, MapPin, Route as RouteIcon, Radio, CheckCircle2, Maximize2, X, ClipboardList } from "lucide-react";
import { STATUS_LABEL_RU, type DeliveryStatus } from "@/lib/delivery/types";
import { parseLatLngPair } from "@/lib/delivery/warehouse";
import { agoLabel, isStale } from "@/lib/delivery/live";
import { DeliveryMap, type MapCourier, type MapPoint } from "@/components/admin/delivery-map";

interface Delivery {
  id: string;
  createdAt: string;
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
  deliveredAt: string;
}
interface Courier { id: string; name: string }
interface Warehouse { id: string; name: string; lat: number | null; lng: number | null }
interface OrderItem {
  rowNumber: number;
  clientName: string;
  phone: string;
  whatsapp: string;
  address: string;
  orderType: string;
  partName: string;
  quantity: number;
  status: string;
}
interface Office { address: string; lat: number | null; lng: number | null }
interface RouteStop { kind: "pickup" | "dropoff"; label: string; etaMinutes: number; legKm: number }
interface Route { stops: RouteStop[]; totalKm: number; totalMinutes: number; geometry?: [number, number][] | null }
interface LiveCourier {
  id: string;
  name: string;
  phone: string;
  activeCount: number;
  enRoute: number;
  location: { lat: number; lng: number; updatedAt: string } | null;
  destination: string | null;
  destinationKind: "pickup" | "dropoff" | null;
  totalKm: number;
  totalMinutes: number;
  warehouseNames: string[];
}

type Draft = Omit<Delivery, "lat" | "lng" | "status" | "createdAt" | "deliveredAt"> & {
  latlng: string;
  status?: DeliveryStatus;
};

const emptyDraft: Draft = {
  id: "", customerName: "", phone: "", whatsapp: "", address: "", latlng: "",
  items: "", warehouseIds: [], courierId: "",
};

const ACTIVE_STATUSES = new Set<DeliveryStatus>(["new", "assigned", "picking", "en_route"]);

const STATUS_COLOR: Record<DeliveryStatus, string> = {
  new: "bg-paper-soft text-ink-mute dark:bg-ink-mute",
  assigned: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-200",
  picking: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-200",
  en_route: "bg-brand/10 text-brand",
  delivered: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200",
  canceled: "bg-paper-soft text-ink-mute line-through dark:bg-ink-mute",
};

function etaClock(min: number): string {
  const d = new Date(Date.now() + min * 60000);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function TabDeliveries() {
  const [rows, setRows] = useState<Delivery[] | null>(null);
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [office, setOffice] = useState<Office | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  const [live, setLive] = useState<LiveCourier[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [selected, setSelected] = useState(""); // courier focused on the map
  const [route, setRoute] = useState<Route | null>(null);

  async function refresh() {
    const [d, c, w, o, s] = await Promise.all([
      fetch("/api/admin/deliveries").then((r) => r.json()),
      fetch("/api/admin/couriers").then((r) => r.json()),
      fetch("/api/admin/warehouses").then((r) => r.json()),
      fetch("/api/admin/orders").then((r) => r.json()).catch(() => ({ ok: false })),
      fetch("/api/admin/settings").then((r) => r.json()).catch(() => ({ ok: false })),
    ]);
    setRows(d.ok ? d.deliveries : []);
    setCouriers(c.ok ? c.couriers : []);
    setWarehouses(w.ok ? w.warehouses : []);
    setOrders(o.ok ? o.orders : []);
    if (s.ok && s.settings) {
      const g = s.settings as Record<string, string>;
      const num = (v: string) => (v && Number.isFinite(Number(v.replace(",", "."))) ? Number(v.replace(",", ".")) : null);
      setOffice({ address: g.pickup_address ?? "", lat: num(g.office_lat ?? ""), lng: num(g.office_lng ?? "") });
    }
  }
  useEffect(() => {
    refresh();
  }, []);

  // Poll live courier positions; refresh the focused route alongside so its
  // road line follows the courier as they move.
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const j = await fetch("/api/admin/live").then((r) => r.json()).catch(() => null);
      if (!alive) return;
      setLive(j?.ok ? j.couriers : []);
      setNow(Date.now());
      if (selected) {
        const r = await fetch(`/api/admin/deliveries?courierId=${encodeURIComponent(selected)}`)
          .then((x) => x.json())
          .catch(() => null);
        if (alive) setRoute(r?.route ?? null);
      }
    };
    load();
    const t = setInterval(load, 15000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [selected]);

  const courierName = useMemo(() => {
    const m = new Map(couriers.map((c) => [c.id, c.name]));
    return (id: string) => m.get(id) || "—";
  }, [couriers]);

  const whName = useMemo(() => {
    const m = new Map(warehouses.map((w) => [w.id, w.name]));
    return (id: string) => m.get(id) || id;
  }, [warehouses]);

  // Map data derived from live + deliveries + warehouses.
  const mapCouriers: MapCourier[] = live
    .filter((c) => c.location)
    .map((c) => ({ id: c.id, name: c.name, lat: c.location!.lat, lng: c.location!.lng, stale: isStale(c.location!.updatedAt, now) }));
  const mapWarehouses: MapPoint[] = warehouses
    .filter((w) => w.lat != null && w.lng != null)
    .map((w) => ({ id: w.id, name: w.name, lat: w.lat as number, lng: w.lng as number }));
  const mapDrops: MapPoint[] = (rows ?? [])
    .filter((d) => ACTIVE_STATUSES.has(d.status) && d.lat != null && d.lng != null)
    .map((d) => ({ id: d.id, name: d.customerName || d.address, lat: d.lat as number, lng: d.lng as number }));
  const officePoint: MapPoint | null =
    office && office.lat != null && office.lng != null
      ? { id: "office", name: office.address || "Офис", lat: office.lat, lng: office.lng }
      : null;

  // Prefill the delivery draft from an existing order. Самовывоз → the office
  // address/coords (the courier brings the parcel to the office).
  function prefillFromOrder(o: OrderItem) {
    const isPickup = o.orderType === "Самовывоз";
    const items = `${o.partName}${o.quantity > 1 ? ` ×${o.quantity}` : ""}`;
    setDraft((cur) => ({
      ...(cur ?? emptyDraft),
      customerName: o.clientName,
      phone: o.phone,
      whatsapp: o.whatsapp,
      items,
      address: isPickup ? office?.address ?? "" : o.address,
      latlng: isPickup && office?.lat != null && office?.lng != null ? `${office.lat}, ${office.lng}` : cur?.latlng ?? "",
      warehouseIds: warehouses.length === 1 ? [warehouses[0].id] : cur?.warehouseIds ?? [],
    }));
  }

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

  function toggleSelect(courierId: string) {
    const next = selected === courierId ? "" : courierId;
    setSelected(next);
    setRoute(null);
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

  const active = rows.filter((d) => ACTIVE_STATUSES.has(d.status));
  const done = rows.filter((d) => d.status === "delivered");

  return (
    <div className="space-y-4">
      <div className="card flex items-center gap-2 text-base font-bold">
        <Truck className="h-5 w-5 text-brand" /> Доставки
      </div>

      {/* Live map */}
      <div className="card space-y-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <MapPin className="h-4 w-4 text-brand" /> Карта
          <div className="ml-auto flex items-center gap-3">
            {selected && (
              <button className="text-xs font-semibold text-brand" onClick={() => toggleSelect(selected)}>
                сбросить маршрут
              </button>
            )}
            <button className="inline-flex items-center gap-1 text-xs font-semibold text-brand" onClick={() => setFullscreen(true)}>
              <Maximize2 className="h-3.5 w-3.5" /> на весь экран
            </button>
          </div>
        </div>
        {!fullscreen && (
          <DeliveryMap
            couriers={mapCouriers}
            warehouses={mapWarehouses}
            drops={mapDrops}
            office={officePoint}
            routeGeometry={selected ? route?.geometry ?? null : null}
            className="h-80 w-full overflow-hidden rounded-2xl sm:h-96"
          />
        )}
        <MapLegend hasOffice={!!officePoint} />
      </div>

      {/* Fullscreen map overlay */}
      {fullscreen && (
        <div className="fixed inset-0 z-[60] flex flex-col bg-paper dark:bg-ink">
          <div className="flex items-center justify-between gap-2 border-b border-paper-mute px-4 py-3 dark:border-ink-mute">
            <span className="flex items-center gap-2 font-semibold"><MapPin className="h-4 w-4 text-brand" /> Карта · курьеры</span>
            <div className="flex items-center gap-3">
              {selected && (
                <button className="text-xs font-semibold text-brand" onClick={() => toggleSelect(selected)}>сбросить маршрут</button>
              )}
              <button className="btn-secondary !px-3 !py-2 text-sm" onClick={() => setFullscreen(false)}>
                <X className="h-4 w-4" /> Закрыть
              </button>
            </div>
          </div>
          <DeliveryMap
            couriers={mapCouriers}
            warehouses={mapWarehouses}
            drops={mapDrops}
            office={officePoint}
            routeGeometry={selected ? route?.geometry ?? null : null}
            className="w-full flex-1"
          />
        </div>
      )}

      {/* Live couriers */}
      {live.length > 0 && (
        <div className="card space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Radio className="h-4 w-4 text-brand" /> Курьеры на линии
          </div>
          {live.map((c) => (
            <div
              key={c.id}
              className={`rounded-2xl px-3 py-2 text-sm ${selected === c.id ? "bg-brand/10 ring-1 ring-brand" : "bg-paper-soft dark:bg-ink-mute"}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <span className="font-semibold">{c.name}</span>
                  {c.enRoute > 0 && <span className="rounded-full bg-brand/10 px-2 py-0.5 text-xs font-semibold text-brand">в пути: {c.enRoute}</span>}
                  <span className="text-ink-mute dark:text-paper-mute">доставок: {c.activeCount}</span>
                </span>
                <span className="flex items-center gap-2">
                  {c.location ? (
                    <span className={isStale(c.location.updatedAt, now) ? "text-ink-mute dark:text-paper-mute" : "text-emerald-600"}>
                      {agoLabel(c.location.updatedAt, now)}
                    </span>
                  ) : (
                    <span className="text-ink-mute dark:text-paper-mute">нет геопозиции</span>
                  )}
                  <button
                    onClick={() => toggleSelect(c.id)}
                    className="inline-flex items-center gap-1 rounded-xl border border-brand/40 px-2 py-1 text-xs font-semibold text-brand"
                  >
                    <RouteIcon className="h-3.5 w-3.5" /> {selected === c.id ? "скрыть" : "маршрут"}
                  </button>
                </span>
              </div>
              {c.activeCount > 0 && (
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-ink-mute dark:text-paper-mute">
                  {c.destination && (
                    <span>
                      едет: <strong className="text-ink dark:text-paper">{c.destinationKind === "pickup" ? "склад " : ""}{c.destination}</strong>
                    </span>
                  )}
                  <span>маршрут ≈ {c.totalKm} км · {c.totalMinutes} мин</span>
                  {c.warehouseNames.length > 0 && <span>склады: {c.warehouseNames.join(", ")}</span>}
                </div>
              )}

              {/* Stop-by-stop route for the focused courier */}
              {selected === c.id && route && (
                route.stops.length === 0 ? (
                  <p className="mt-2 text-xs text-ink-mute dark:text-paper-mute">Нет активных доставок с координатами.</p>
                ) : (
                  <div className="mt-2 space-y-1 border-t border-paper-mute/60 pt-2 dark:border-ink/60">
                    {route.stops.map((s, i) => (
                      <div key={i} className="flex items-center justify-between gap-2 text-xs">
                        <span className="flex items-center gap-2">
                          <span className={`rounded-full px-2 py-0.5 font-semibold ${s.kind === "pickup" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-200" : "bg-brand/10 text-brand"}`}>
                            {s.kind === "pickup" ? "Склад" : "Клиент"}
                          </span>
                          {s.label}
                        </span>
                        <span className="whitespace-nowrap text-ink-mute dark:text-paper-mute">~{etaClock(s.etaMinutes)} · +{s.legKm} км</span>
                      </div>
                    ))}
                    <div className="pt-1 text-right text-xs font-semibold">
                      Итого ≈ {route.totalKm} км · {route.totalMinutes} мин
                    </div>
                  </div>
                )
              )}
            </div>
          ))}
        </div>
      )}

      {/* Active deliveries */}
      {active.map((d) => (
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
            {d.warehouseIds.length > 0 && <span>склады: {d.warehouseIds.map(whName).join(", ")}</span>}
          </div>
        </div>
      ))}

      {/* Completed deliveries */}
      {done.length > 0 && (
        <details className="card">
          <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Выполненные ({done.length})
          </summary>
          <div className="mt-3 space-y-2">
            {done.slice().reverse().map((d) => (
              <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-paper-soft px-3 py-2 text-sm dark:bg-ink-mute">
                <span className="flex items-center gap-2">
                  <span className="font-semibold">{d.customerName || d.address || "—"}</span>
                  <span className="text-ink-mute dark:text-paper-mute">{d.items}</span>
                </span>
                <span className="whitespace-nowrap text-xs text-ink-mute dark:text-paper-mute">
                  {d.courierId ? courierName(d.courierId) : "—"}
                  {d.deliveredAt ? ` · ${new Date(d.deliveredAt).toLocaleString("ru")}` : ""}
                </span>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Create / edit */}
      {draft ? (
        <div className="card space-y-3">
          <div className="text-base font-bold">{draft.id ? "Изменить доставку" : "Новая доставка"}</div>
          {!draft.id && orders.length > 0 && (
            <div>
              <label className="label"><ClipboardList className="mr-1 inline h-4 w-4" />Взять из заказа</label>
              <select
                className="input"
                value=""
                onChange={(e) => {
                  const o = orders.find((x) => String(x.rowNumber) === e.target.value);
                  if (o) prefillFromOrder(o);
                }}
              >
                <option value="">— выберите заказ —</option>
                {orders.slice().reverse().map((o) => (
                  <option key={o.rowNumber} value={o.rowNumber}>
                    #{o.rowNumber} · {o.clientName || o.phone} · {o.partName}{o.orderType === "Самовывоз" ? " · самовывоз→офис" : ""}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-ink-mute dark:text-paper-mute">
                Подставит клиента, адрес и товар. Склад проверьте и поменяйте ниже, если позиции нет в наличии.
              </p>
            </div>
          )}
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

function MapLegend({ hasOffice }: { hasOffice: boolean }) {
  return (
    <div className="flex flex-wrap gap-3 text-xs text-ink-mute dark:text-paper-mute">
      <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ background: "#E10600" }} /> курьер</span>
      <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ background: "#F59E0B" }} /> склад</span>
      <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ background: "#2563EB" }} /> клиент</span>
      {hasOffice && <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ background: "#16A34A" }} /> офис</span>}
    </div>
  );
}
