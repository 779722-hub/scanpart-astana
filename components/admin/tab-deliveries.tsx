"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Loader2, Truck, Save, Trash2, Plus, MapPin, Route as RouteIcon, Radio, CheckCircle2, Maximize2, X, ClipboardList } from "lucide-react";
import { STATUS_LABEL_RU, type DeliveryStatus } from "@/lib/delivery/types";
import { parseLatLngPair } from "@/lib/delivery/warehouse";
import { agoLabel, isStale } from "@/lib/delivery/live";
import { groupItemsByWarehouse } from "@/lib/delivery/items";
import { DeliveryMap, type MapCourier, type MapPoint, type MarkerShape } from "@/components/admin/delivery-map";

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
interface Warehouse { id: string; name: string; address: string; lat: number | null; lng: number | null; sourceCode: string; color: string; pickupMinutes: number }
interface OrderItem {
  rowNumber: number;
  date: string;
  clientName: string;
  phone: string;
  whatsapp: string;
  address: string;
  orderType: string;
  partName: string;
  quantity: number;
  status: string;
  source: string;
}
// Заказ = одна корзина (один момент оформления + телефон). Позиций может быть
// несколько — доставка на весь заказ одна.
interface OrderGroup {
  key: string;
  clientName: string;
  phone: string;
  whatsapp: string;
  address: string;
  orderType: string;
  rows: OrderItem[];
}
interface Office { address: string; lat: number | null; lng: number | null; color: string }
interface Suggestion { courierId: string; courierName: string; activeCount: number; addedMinutes: number; addedKm: number; totalMinutes: number }
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

// Ориентировочный расчёт цепочки маршрута для карточки доставки. Средняя
// городская скорость 22 км/ч уже закладывает пробки; коэффициент 1.35
// переводит прямую (Haversine) в примерную длину по дорогам.
const CITY_SPEED_KMH = 22;
const ROAD_FACTOR = 1.35;
const R_KM = 6371;
function havKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function TabDeliveries() {
  const [rows, setRows] = useState<Delivery[] | null>(null);
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [office, setOffice] = useState<Office | null>(null);
  const [markers, setMarkers] = useState<{ courierColor: string; courierShape: MarkerShape; clientColor: string; clientShape: MarkerShape }>({
    courierColor: "#E10600",
    courierShape: "circle",
    clientColor: "#2563EB",
    clientShape: "circle",
  });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [geoBusy, setGeoBusy] = useState(false);

  // Нативный список <select> раздаётся по ширине самого длинного пункта и
  // вылезает за экран — названия запчастей длинные. Режем текст пункта.
  function clip(s: string, n: number): string {
    const v = (s ?? "").trim();
    return v.length > n ? v.slice(0, n - 1).trimEnd() + "…" : v;
  }

  async function regeocode() {
    if (!confirm("Пересчитать координаты доставок по адресам (только Астана)? Точки вне Астаны будут исправлены или убраны с карты.")) return;
    setGeoBusy(true);
    try {
      const j = await fetch("/api/admin/deliveries/regeocode", { method: "POST" }).then((r) => r.json());
      alert(j.ok ? `Готово: исправлено ${j.fixed}, убрано вне Астаны ${j.cleared} (проверено ${j.checked}).` : "Не удалось.");
      await refresh();
    } finally {
      setGeoBusy(false);
    }
  }

  const [live, setLive] = useState<LiveCourier[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [selected, setSelected] = useState(""); // courier focused on the map
  const [route, setRoute] = useState<Route | null>(null);
  const [suggestFor, setSuggestFor] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [suggestBusy, setSuggestBusy] = useState(false);

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
      setOffice({ address: g.pickup_address ?? "", lat: num(g.office_lat ?? ""), lng: num(g.office_lng ?? ""), color: g.office_color || "#16A34A" });
      setMarkers({
        courierColor: g.courier_color || "#E10600",
        courierShape: (g.courier_shape || "circle") as MarkerShape,
        clientColor: g.client_color || "#2563EB",
        clientShape: (g.client_shape || "circle") as MarkerShape,
      });
    }
  }
  useEffect(() => {
    refresh();
  }, []);

  // Автоопределение координат «откуда/куда» один раз при открытии вкладки:
  // геокодим офис и доставки без координат, чтобы маршрут строился сам, без
  // ручных кнопок. «Где сейчас» (курьер) приходит с GPS телефона.
  const healedRef = useRef(false);
  useEffect(() => {
    if (healedRef.current || !rows) return;
    healedRef.current = true;
    (async () => {
      let changed = false;
      if (office?.address && (office.lat == null || office.lng == null)) {
        const g = await fetch(`/api/admin/geocode?q=${encodeURIComponent(office.address)}`)
          .then((r) => r.json())
          .catch(() => null);
        if (g?.ok) {
          await fetch("/api/admin/settings", {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ patch: { office_lat: String(g.lat), office_lng: String(g.lng) } }),
          }).catch(() => {});
          changed = true;
        }
      }
      const needGeo = rows.some((d) => ACTIVE_STATUSES.has(d.status) && d.address.trim() && d.lat == null);
      if (needGeo) {
        await fetch("/api/admin/deliveries/regeocode", { method: "POST" }).catch(() => {});
        changed = true;
      }
      if (changed) await refresh();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, office]);

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

  const whById = useMemo(() => {
    const m = new Map(warehouses.map((w) => [w.id, w]));
    return (id: string) => m.get(id) || null;
  }, [warehouses]);

  const liveById = useMemo(() => {
    const m = new Map(live.map((c) => [c.id, c]));
    return (id: string) => m.get(id) || null;
  }, [live]);

  // We only operate in Astana — never plot a point outside the city, even if a
  // stale coordinate lingers in the sheet.
  const inAstana = (lat: number, lng: number) => lat >= 50.95 && lat <= 51.4 && lng >= 71.1 && lng <= 71.8;

  // Map data derived from live + deliveries + warehouses.
  const mapCouriers: MapCourier[] = live
    .filter((c) => c.location && inAstana(c.location.lat, c.location.lng))
    .map((c) => ({ id: c.id, name: c.name, lat: c.location!.lat, lng: c.location!.lng, stale: isStale(c.location!.updatedAt, now) }));
  const mapWarehouses: MapPoint[] = warehouses
    .filter((w) => w.lat != null && w.lng != null && inAstana(w.lat, w.lng))
    .map((w) => ({ id: w.id, name: w.name, lat: w.lat as number, lng: w.lng as number, color: w.color }));
  const mapDrops: MapPoint[] = (rows ?? [])
    .filter((d) => ACTIVE_STATUSES.has(d.status) && d.lat != null && d.lng != null && inAstana(d.lat as number, d.lng as number))
    .map((d) => ({ id: d.id, name: d.customerName || d.address, lat: d.lat as number, lng: d.lng as number }));
  const officePoint: MapPoint | null =
    office && office.lat != null && office.lng != null && inAstana(office.lat, office.lng)
      ? { id: "office", name: office.address || "Офис", lat: office.lat, lng: office.lng, color: office.color }
      : null;

  // Позиции заказов из /api/admin/orders приходят построчно — группируем в
  // заказы (дата+телефон), как во вкладке «Заказы», чтобы заказ из 3 позиций
  // был ОДНОЙ доставкой, а не тремя.
  const orderGroups = useMemo<OrderGroup[]>(() => {
    const map = new Map<string, OrderItem[]>();
    for (const o of orders) {
      const key = `${o.date}__${o.phone}`;
      const arr = map.get(key);
      if (arr) arr.push(o);
      else map.set(key, [o]);
    }
    return Array.from(map.entries())
      .map(([key, rows]) => {
        const f = rows[0];
        return { key, clientName: f.clientName, phone: f.phone, whatsapp: f.whatsapp, address: f.address, orderType: f.orderType, rows };
      })
      .sort((a, b) => b.key.localeCompare(a.key)); // новые сверху (ключ с датой)
  }, [orders]);

  // Prefill the delivery draft from a whole order group. Самовывоз → the office
  // address/coords (the courier brings the parcel to the office).
  function prefillFromGroup(g: OrderGroup) {
    const isPickup = g.orderType === "Самовывоз";
    const items = groupItemsByWarehouse(g.rows);
    // Объединяем склады по кодам источников всех позиций (Р1/М2/…);
    // если склад один — берём его.
    const ids = new Set<string>();
    for (const r of g.rows) {
      const w = r.source ? warehouses.find((x) => x.sourceCode === r.source) : undefined;
      if (w) ids.add(w.id);
    }
    let warehouseIds = Array.from(ids);
    if (!warehouseIds.length && warehouses.length === 1) warehouseIds = [warehouses[0].id];
    setDraft((cur) => ({
      ...(cur ?? emptyDraft),
      customerName: g.clientName,
      phone: g.phone,
      whatsapp: g.whatsapp,
      items,
      address: isPickup ? office?.address ?? "" : g.address,
      latlng: isPickup && office?.lat != null && office?.lng != null ? `${office.lat}, ${office.lng}` : cur?.latlng ?? "",
      warehouseIds: warehouseIds.length ? warehouseIds : cur?.warehouseIds ?? [],
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

  async function suggest(deliveryId: string) {
    if (suggestFor === deliveryId) {
      setSuggestFor(null);
      return;
    }
    setSuggestFor(deliveryId);
    setSuggestions(null);
    setSuggestBusy(true);
    try {
      const j = await fetch(`/api/admin/deliveries/suggest?deliveryId=${encodeURIComponent(deliveryId)}`).then((r) => r.json());
      setSuggestions(j.ok ? j.suggestions : []);
    } finally {
      setSuggestBusy(false);
    }
  }

  async function assignCourier(d: Delivery, courierId: string) {
    await fetch("/api/admin/deliveries", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: d.id,
        customerName: d.customerName,
        phone: d.phone,
        whatsapp: d.whatsapp,
        address: d.address,
        lat: d.lat,
        lng: d.lng,
        items: d.items,
        warehouseIds: d.warehouseIds,
        courierId,
        status: d.status,
      }),
    });
    setSuggestFor(null);
    await refresh();
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
            <button className="inline-flex items-center gap-1 text-xs font-semibold text-brand" onClick={regeocode} disabled={geoBusy} title="Пересчитать координаты доставок по адресам, только Астана">
              {geoBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MapPin className="h-3.5 w-3.5" />} только Астана
            </button>
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
            courierColor={markers.courierColor}
            courierShape={markers.courierShape}
            clientColor={markers.clientColor}
            clientShape={markers.clientShape}
            className="h-[26rem] w-full overflow-hidden rounded-2xl sm:h-[31rem]"
          />
        )}
        <MapLegend warehouses={mapWarehouses} office={officePoint} markers={markers} />
        {(() => {
          const noCoords = [
            ...warehouses.filter((w) => w.lat == null || w.lng == null).map((w) => w.name),
            ...(office && (office.lat == null || office.lng == null) ? ["офис"] : []),
          ];
          return noCoords.length > 0 ? (
            <div className="rounded-2xl bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
              Не видно на карте (нет координат): {noCoords.join(", ")}. Добавьте координаты в «Складах»/«Настройках»
              (кнопка «По адресу» определит их автоматически).
            </div>
          ) : null;
        })()}
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
            courierColor={markers.courierColor}
            courierShape={markers.courierShape}
            clientColor={markers.clientColor}
            clientShape={markers.clientShape}
            className="w-full flex-1"
          />
        </div>
      )}

      {live.length === 0 && (
        <div className="card text-sm text-ink-mute dark:text-paper-mute">
          Нет курьеров на связи. Курьер появляется, когда войдёт в приложение (scanpart.kz/courier) с включённой геолокацией,
          либо нажмите «На карту (тест)» во вкладке «Курьеры».
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
                      {agoLabel(c.location.updatedAt, now)} · {c.location.lat.toFixed(4)}, {c.location.lng.toFixed(4)}
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
          <div className="whitespace-pre-line text-sm">{d.items}</div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-ink-mute dark:text-paper-mute">
            <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{d.address || "нет адреса"}{d.lat == null && " (нет координат)"}</span>
            {d.courierId ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 font-semibold text-blue-700 dark:bg-blue-900/30 dark:text-blue-200">
                <Truck className="h-3 w-3" /> курьер: {courierName(d.courierId)}
              </span>
            ) : (
              <span className="text-brand">курьер не назначен</span>
            )}
            {d.warehouseIds.length > 0 && <span>склады: {d.warehouseIds.map(whName).join(", ")}</span>}
            <button
              onClick={() => suggest(d.id)}
              className="inline-flex items-center gap-1 rounded-xl border border-brand/40 px-2 py-1 font-semibold text-brand"
            >
              <RouteIcon className="h-3.5 w-3.5" /> {d.courierId ? "Поменять курьера" : "Подобрать курьера"}
            </button>
          </div>

          {/* Цепочка маршрута: курьер → склад(ы) → клиент (когда курьер назначен). */}
          {d.courierId && (
            <DeliveryChain
              delivery={d}
              warehouses={d.warehouseIds.map(whById).filter((w): w is Warehouse => w != null)}
              courierLoc={(() => {
                const lc = liveById(d.courierId);
                return lc?.location && inAstana(lc.location.lat, lc.location.lng)
                  ? { lat: lc.location.lat, lng: lc.location.lng }
                  : null;
              })()}
            />
          )}

          {suggestFor === d.id && (
            <div className="space-y-1 rounded-2xl bg-paper-soft px-3 py-2 dark:bg-ink-mute">
              {suggestBusy || !suggestions ? (
                <div className="flex items-center gap-2 text-xs text-ink-mute dark:text-paper-mute">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Считаю лучший вариант…
                </div>
              ) : suggestions.length === 0 ? (
                <div className="text-xs text-ink-mute dark:text-paper-mute">Нет активных курьеров.</div>
              ) : (
                suggestions.map((s, i) => (
                  <div key={s.courierId} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="flex items-center gap-2">
                      {i === 0 && <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200">лучший</span>}
                      <span className="font-semibold">{s.courierName}</span>
                      <span className="text-ink-mute dark:text-paper-mute">+{s.addedMinutes} мин · +{s.addedKm} км{s.activeCount > 0 ? ` · сейчас ${s.activeCount}` : ""}</span>
                    </span>
                    <button
                      onClick={() => assignCourier(d, s.courierId)}
                      className="rounded-xl bg-brand px-3 py-1 font-semibold text-white"
                    >
                      Назначить
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
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
          {!draft.id && orderGroups.length > 0 && (
            <div>
              <label className="label"><ClipboardList className="mr-1 inline h-4 w-4" />Взять из заказа</label>
              <select
                className="input"
                value=""
                onChange={(e) => {
                  const g = orderGroups.find((x) => x.key === e.target.value);
                  if (g) prefillFromGroup(g);
                }}
              >
                <option value="">— выберите заказ —</option>
                {orderGroups.map((g) => (
                  <option key={g.key} value={g.key}>
                    {clip(g.clientName || g.phone, 20)} · {g.rows.length} поз.: {clip(g.rows.map((r) => r.partName).join(", "), 38)}{g.orderType === "Самовывоз" ? " · самовывоз→офис" : ""}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-ink-mute dark:text-paper-mute">
                Весь заказ (все позиции) станет одной доставкой. Склады проверьте ниже, если чего-то нет в наличии.
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

/**
 * Легенда обязана повторять карту. Цвет и форму меток курьера и клиента
 * задают в «Настройках», склады — во вкладке «Склады»; раньше здесь были
 * зашиты красный и синий, и легенда врала, как только цвет меняли.
 */
function MapLegend({
  warehouses,
  office,
  markers,
}: {
  warehouses: MapPoint[];
  office: MapPoint | null;
  markers: { courierColor: string; courierShape: MarkerShape; clientColor: string; clientShape: MarkerShape };
}) {
  const swatch = (color: string, shape: MarkerShape = "circle") => {
    const style: CSSProperties = { background: color };
    if (shape === "triangle") {
      style.clipPath = "polygon(50% 0, 100% 100%, 0 100%)";
    } else {
      style.borderRadius = shape === "circle" ? "50%" : "2px";
      if (shape === "diamond") style.transform = "rotate(45deg)";
    }
    return (
      <span
        className={`h-2.5 w-2.5 flex-none ${shape === "triangle" ? "" : "ring-1 ring-black/20"}`}
        style={style}
      />
    );
  };
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-mute dark:text-paper-mute">
      <span className="inline-flex items-center gap-1">{swatch(markers.courierColor, markers.courierShape)} курьер</span>
      <span className="inline-flex items-center gap-1">{swatch(markers.clientColor, markers.clientShape)} клиент</span>
      {warehouses.map((w) => (
        <span key={w.id} className="inline-flex items-center gap-1">{swatch(w.color || "#F59E0B")} {w.name}</span>
      ))}
      {office && <span className="inline-flex items-center gap-1">{swatch(office.color || "#16A34A")} офис</span>}
    </div>
  );
}

/**
 * Цепочка маршрута под карточкой доставки: курьер → склад(ы) → клиент, с
 * ориентировочным расстоянием и временем на каждом отрезке (с учётом пробок)
 * и временем получения запчастей на складе. Считается на клиенте по прямой ×
 * дорожный коэффициент — это оценка «на глаз», не навигатор.
 */
function DeliveryChain({
  delivery,
  warehouses,
  courierLoc,
}: {
  delivery: Delivery;
  warehouses: Warehouse[];
  courierLoc: { lat: number; lng: number } | null;
}) {
  type Node = {
    kind: "courier" | "pickup" | "dropoff";
    title: string;
    sub?: string;
    lat: number | null;
    lng: number | null;
    waitMin?: number;
  };
  const nodes: Node[] = [
    { kind: "courier", title: "Курьер", sub: courierLoc ? "текущее местоположение" : "нет геопозиции", lat: courierLoc?.lat ?? null, lng: courierLoc?.lng ?? null },
    ...warehouses.map<Node>((w) => ({ kind: "pickup", title: w.name, sub: w.address || undefined, lat: w.lat, lng: w.lng, waitMin: w.pickupMinutes })),
    { kind: "dropoff", title: delivery.customerName || "Клиент", sub: delivery.address || undefined, lat: delivery.lat, lng: delivery.lng, waitMin: 5 },
  ];

  // Копим время от «сейчас»: приезд на точку и выезд после ожидания на складе.
  // etaClock(min) переводит «минут от текущего момента» в часы:минуты.
  let prev: { lat: number; lng: number } | null = null;
  let acc = 0;
  let totalKm = 0;
  const enriched = nodes.map((n, i) => {
    let legKm: number | null = null;
    let legMin: number | null = null;
    let arrive: number | null = null;
    let depart: number | null = null;
    const has = n.lat != null && n.lng != null;
    if (i === 0) {
      if (has) { arrive = 0; prev = { lat: n.lat as number, lng: n.lng as number }; }
    } else if (has) {
      if (prev) {
        legKm = havKm(prev, { lat: n.lat as number, lng: n.lng as number }) * ROAD_FACTOR;
        legMin = (legKm / CITY_SPEED_KMH) * 60;
        totalKm += legKm;
        acc += legMin;
        arrive = acc;
      }
      prev = { lat: n.lat as number, lng: n.lng as number };
    }
    if (arrive != null && n.waitMin) { acc += n.waitMin; depart = acc; }
    return { legKm, legMin, arrive, depart };
  });

  const routable = nodes.every((n) => n.lat != null && n.lng != null);
  const deliveryMin = enriched[enriched.length - 1]?.arrive ?? null;

  return (
    <div className="rounded-2xl bg-paper-soft px-3 py-2.5 dark:bg-ink-mute">
      <div className="space-y-0">
        {nodes.map((n, i) => {
          const e = enriched[i];
          const dotColor =
            n.kind === "courier" ? "bg-brand" : n.kind === "pickup" ? "bg-amber-500" : "bg-blue-600";
          return (
            <div key={i}>
              {i > 0 && (
                <div className="ml-[5px] flex items-center gap-2 border-l-2 border-dashed border-paper-mute py-1 pl-4 text-xs text-ink-mute dark:border-ink dark:text-paper-mute">
                  {e.legKm != null ? (
                    <span>↓ ≈ {e.legKm.toFixed(1)} км · {Math.max(1, Math.round(e.legMin!))} мин в пути</span>
                  ) : (
                    <span className="text-amber-600">↓ нет координат — отрезок не посчитать</span>
                  )}
                </div>
              )}
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-start gap-2.5">
                  <span className={`mt-1 h-2.5 w-2.5 flex-none rounded-full ${dotColor}`} />
                  <div className="min-w-0 leading-tight">
                    <div className="text-sm font-semibold">
                      {n.title}
                      {n.waitMin && n.kind === "pickup" ? (
                        <span className="ml-2 font-normal text-ink-mute dark:text-paper-mute">· на складе ~{n.waitMin} мин</span>
                      ) : null}
                    </div>
                    {n.sub && <div className="truncate text-xs text-ink-mute dark:text-paper-mute">{n.sub}</div>}
                  </div>
                </div>
                {/* Время прибытия/выезда справа */}
                <div className="flex-none text-right text-xs leading-tight">
                  {n.kind === "courier" && e.arrive != null && (
                    <div><span className="text-ink-mute dark:text-paper-mute">старт</span> <b>{etaClock(0)}</b></div>
                  )}
                  {n.kind === "pickup" && e.arrive != null && (
                    <>
                      <div><span className="text-ink-mute dark:text-paper-mute">приезд</span> <b>{etaClock(e.arrive)}</b></div>
                      {e.depart != null && <div className="text-ink-mute dark:text-paper-mute">выезд {etaClock(e.depart)}</div>}
                    </>
                  )}
                  {n.kind === "dropoff" && e.arrive != null && (
                    <div><span className="text-ink-mute dark:text-paper-mute">доставка</span> <b className="text-emerald-600">{etaClock(e.arrive)}</b></div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {routable && deliveryMin != null && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 border-t border-paper-mute/60 pt-2 text-xs dark:border-ink/60">
          <span className="text-ink-mute dark:text-paper-mute">Ориентировочно, с учётом пробок и времени на складе</span>
          <span className="font-semibold">
            Весь маршрут ≈ {totalKm.toFixed(1)} км · ~{Math.round(deliveryMin)} мин · доставка ~{etaClock(deliveryMin)}
          </span>
        </div>
      )}
    </div>
  );
}
