"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Package, Search, Trash2, MessageCircle, Pencil, Save, X, Truck, Plus } from "lucide-react";
import { normalizePhoneE164 } from "@/lib/schemas";

const ORDER_TYPES = ["Экспресс", "Самовывоз"] as const;

interface Order {
  rowNumber: number;
  date: string;
  clientName: string;
  vin: string;
  vehicle: string;
  partName: string;
  partArticle: string;
  brand: string;
  price: number;
  quantity: number;
  orderType: string;
  address: string;
  phone: string;
  whatsapp: string;
  status: string;
  source: string;
}

interface OrderGroup {
  key: string;
  date: string;
  clientName: string;
  phone: string;
  whatsapp: string;
  address: string;
  orderType: string;
  status: string;
  vin: string;
  vehicle: string;
  rows: Order[];
  total: number;
}

const STATUSES = ["Новый", "В работе", "Выполнен", "Отменён"];
const fmt = (n: number) => new Intl.NumberFormat("ru-RU").format(n);

export function TabOrders() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [q, setQ] = useState("");
  const [saving, setSaving] = useState<string | null>(null); // group key
  const [editing, setEditing] = useState<string | null>(null);
  const [editType, setEditType] = useState<string>("Экспресс");
  const [editAddr, setEditAddr] = useState<string>("");
  const [adding, setAdding] = useState<string | null>(null); // group key
  const emptyItem = { partName: "", brand: "", partArticle: "", price: "", quantity: "1", source: "" };
  const [newItem, setNewItem] = useState(emptyItem);
  const [office, setOffice] = useState<{ address: string; lat: number | null; lng: number | null }>({ address: "", lat: null, lng: null });
  const [warehouses, setWarehouses] = useState<{ id: string; sourceCode: string }[]>([]);

  useEffect(() => {
    refresh();
    fetch("/api/admin/warehouses")
      .then((r) => r.json())
      .then((j) => {
        if (j.ok) setWarehouses(j.warehouses);
      })
      .catch(() => {});
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then((j) => {
        if (j.ok && j.settings) {
          const g = j.settings as Record<string, string>;
          const num = (v: string) => (v && Number.isFinite(Number(v.replace(",", "."))) ? Number(v.replace(",", ".")) : null);
          setOffice({ address: g.pickup_address ?? "", lat: num(g.office_lat ?? ""), lng: num(g.office_lng ?? "") });
        }
      })
      .catch(() => {});
  }, []);

  async function refresh() {
    const j = await fetch("/api/admin/orders").then((r) => r.json());
    setOrders(j.ok ? (j.orders as Order[]) : []);
  }

  const headers = { "content-type": "application/json" };

  // Group the individual item-rows into one order per checkout (same timestamp
  // + phone), so a multi-part order is one block and one delivery.
  const groups = useMemo<OrderGroup[]>(() => {
    if (!orders) return [];
    const map = new Map<string, Order[]>();
    for (const o of orders) {
      const key = `${o.date}__${o.phone}`;
      const arr = map.get(key);
      if (arr) arr.push(o);
      else map.set(key, [o]);
    }
    let list: OrderGroup[] = Array.from(map.entries()).map(([key, rows]) => {
      const f = rows[0];
      return {
        key,
        date: f.date,
        clientName: f.clientName,
        phone: f.phone,
        whatsapp: f.whatsapp,
        address: f.address,
        orderType: f.orderType,
        status: f.status,
        vin: f.vin,
        vehicle: f.vehicle,
        rows,
        total: rows.reduce((s, r) => s + r.price * r.quantity, 0),
      };
    });
    const needle = q.trim().toLowerCase();
    if (needle) {
      list = list.filter((g) =>
        g.rows.some((o) =>
          [o.partName, o.brand, o.partArticle, o.clientName, o.phone, o.vin, o.vehicle].some((fld) =>
            (fld || "").toLowerCase().includes(needle)
          )
        )
      );
    }
    list.sort((a, b) => b.date.localeCompare(a.date));
    return list;
  }, [orders, q]);

  const inGroup = (g: OrderGroup, o: Order) => g.rows.some((r) => r.rowNumber === o.rowNumber);

  async function setGroupStatus(g: OrderGroup, status: string) {
    setSaving(g.key);
    try {
      await Promise.all(
        g.rows.map((r) => fetch(`/api/admin/orders/${r.rowNumber}`, { method: "PATCH", headers, body: JSON.stringify({ status }) }))
      );
      setOrders((cur) => cur?.map((o) => (inGroup(g, o) ? { ...o, status } : o)) ?? null);
    } finally {
      setSaving(null);
    }
  }

  function startEdit(g: OrderGroup) {
    setEditing(g.key);
    setEditType(ORDER_TYPES.includes(g.orderType as (typeof ORDER_TYPES)[number]) ? g.orderType : "Экспресс");
    setEditAddr(g.address);
  }

  async function saveEdit(g: OrderGroup) {
    setSaving(g.key);
    try {
      const address = editType === "Самовывоз" ? "" : editAddr.trim();
      await Promise.all(
        g.rows.map((r) =>
          fetch(`/api/admin/orders/${r.rowNumber}`, { method: "PATCH", headers, body: JSON.stringify({ orderType: editType, address }) })
        )
      );
      setOrders((cur) => cur?.map((o) => (inGroup(g, o) ? { ...o, orderType: editType, address } : o)) ?? null);
      setEditing(null);
    } finally {
      setSaving(null);
    }
  }

  // One delivery for the whole order: the courier collects every part from the
  // needed warehouses and delivers the set to a single address.
  async function createDelivery(g: OrderGroup) {
    const isPickup = g.orderType === "Самовывоз";
    const dest = isPickup ? office.address || "офис (задайте адрес в Настройках)" : g.address || "адрес не указан";
    if (
      !confirm(
        `Создать ОДНУ доставку на весь заказ (${g.rows.length} поз.) для «${g.clientName || g.phone}»?\nКуда: ${dest}${
          isPickup ? "\n(самовывоз — курьер привозит в офис)" : ""
        }\nКурьер соберёт по нужным складам и привезёт комплект. Курьера назначьте во вкладке «Доставки».`
      )
    )
      return;
    setSaving(g.key);
    try {
      const items = g.rows.map((r) => `${r.partName}${r.quantity > 1 ? ` ×${r.quantity}` : ""}`).join(", ");
      // Union of the warehouses tied to each item's source code.
      const ids = new Set<string>();
      for (const r of g.rows) {
        const w = r.source ? warehouses.find((x) => x.sourceCode === r.source) : undefined;
        if (w) ids.add(w.id);
      }
      let warehouseIds = Array.from(ids);
      if (!warehouseIds.length && warehouses.length === 1) warehouseIds = [warehouses[0].id];
      const res = await fetch("/api/admin/deliveries", {
        method: "PUT",
        headers,
        body: JSON.stringify({
          customerName: g.clientName,
          phone: g.phone,
          whatsapp: g.whatsapp,
          address: isPickup ? office.address : g.address,
          lat: isPickup ? office.lat : undefined,
          lng: isPickup ? office.lng : undefined,
          items,
          warehouseIds,
        }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) {
        alert(`Ошибка: ${j.error}`);
        return;
      }
      alert("Доставка на весь заказ создана. Откройте «Доставки»: проверьте склады, координаты и назначьте курьера.");
    } finally {
      setSaving(null);
    }
  }

  async function removeItem(g: OrderGroup, o: Order) {
    const last = g.rows.length === 1;
    const msg = last
      ? `«${o.partName}» — последняя позиция. Заказ будет удалён целиком. Продолжить?`
      : `Убрать позицию «${o.partName}» из заказа?`;
    if (!confirm(msg)) return;
    setSaving(g.key);
    try {
      await fetch(`/api/admin/orders/${o.rowNumber}`, { method: "DELETE" });
      await refresh();
    } finally {
      setSaving(null);
    }
  }

  function startAdd(g: OrderGroup) {
    setNewItem(emptyItem);
    setAdding(g.key);
  }

  async function addItem(g: OrderGroup) {
    const price = Number(String(newItem.price).replace(",", "."));
    const quantity = Number(newItem.quantity);
    if (!newItem.partName.trim() || !Number.isFinite(price) || price < 0 || !Number.isInteger(quantity) || quantity < 1) {
      alert("Заполните название и корректную цену/количество.");
      return;
    }
    setSaving(g.key);
    try {
      const res = await fetch("/api/admin/orders", {
        method: "POST",
        headers,
        body: JSON.stringify({
          fromRow: g.rows[0].rowNumber,
          item: {
            partName: newItem.partName.trim(),
            brand: newItem.brand.trim(),
            partArticle: newItem.partArticle.trim(),
            price,
            quantity,
            source: newItem.source.trim(),
          },
        }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) {
        alert(`Ошибка: ${j.error ?? res.status}`);
        return;
      }
      setAdding(null);
      await refresh();
    } finally {
      setSaving(null);
    }
  }

  async function removeOrder(g: OrderGroup) {
    if (!confirm(`Удалить заказ (${g.rows.length} поз.) безвозвратно?`)) return;
    setSaving(g.key);
    try {
      // Delete from the highest row down so earlier row numbers don't shift.
      const rowsDesc = [...g.rows].sort((a, b) => b.rowNumber - a.rowNumber);
      for (const r of rowsDesc) {
        await fetch(`/api/admin/orders/${r.rowNumber}`, { method: "DELETE" });
      }
      await refresh();
    } finally {
      setSaving(null);
    }
  }

  if (!orders) {
    return (
      <div className="card flex justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-center gap-2">
        <Search className="h-4 w-4 text-ink-mute" />
        <input
          className="input flex-1 min-w-[12rem]"
          placeholder="Поиск: название, бренд, парт-номер, имя, телефон, VIN"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <p className="text-xs text-ink-mute dark:text-paper-mute">
          заказов: {groups.length}
        </p>
      </div>

      {groups.length === 0 ? (
        <div className="card text-center text-sm text-ink-mute dark:text-paper-mute">
          <Package className="mx-auto mb-2 h-8 w-8" />
          Заказов нет.
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => (
            <article key={g.key} className="card">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs text-ink-mute dark:text-paper-mute">
                    {new Date(g.date).toLocaleString("ru")} · {g.rows.length} поз. · итого {fmt(g.total)} ₸
                  </div>
                  <div className="text-lg font-bold">{g.clientName || "—"}</div>
                  <div className="text-sm text-ink-mute dark:text-paper-mute">
                    {g.phone} · {g.orderType}
                    {g.address ? ` · ${g.address}` : ""}
                  </div>
                </div>
                <select
                  className="input !w-auto !py-2 text-sm"
                  value={g.status}
                  onChange={(e) => setGroupStatus(g, e.target.value)}
                  disabled={saving === g.key}
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              {/* Items of this order */}
              <div className="mt-3 divide-y divide-paper-mute/50 dark:divide-ink-mute/50">
                {g.rows.map((o) => (
                  <div key={o.rowNumber} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-2 text-sm">
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold [overflow-wrap:anywhere]">{o.partName}</div>
                      <div className="text-xs text-ink-mute dark:text-paper-mute [overflow-wrap:anywhere]">
                        {o.brand} · <code className="font-mono">{o.partArticle}</code>
                        {o.source && (
                          <span className="ml-2 rounded bg-brand/10 px-1.5 py-0.5 font-semibold text-brand">склад {o.source}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 whitespace-nowrap">
                      <span className="font-semibold">
                        {fmt(o.price)} ₸ × {o.quantity}
                      </span>
                      <button
                        onClick={() => removeItem(g, o)}
                        disabled={saving === g.key}
                        aria-label="Убрать позицию"
                        title="Убрать позицию"
                        className="flex h-7 w-7 flex-none items-center justify-center rounded-lg text-ink-mute transition hover:bg-brand/10 hover:text-brand disabled:opacity-50 dark:text-paper-mute"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {adding === g.key && (
                <div className="mt-3 space-y-3 rounded-2xl border border-paper-mute p-3 dark:border-ink-mute">
                  <div className="text-sm font-semibold">Новая позиция</div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <input
                      className="input sm:col-span-2"
                      placeholder="Название детали*"
                      value={newItem.partName}
                      onChange={(e) => setNewItem({ ...newItem, partName: e.target.value })}
                    />
                    <input
                      className="input"
                      placeholder="Бренд"
                      value={newItem.brand}
                      onChange={(e) => setNewItem({ ...newItem, brand: e.target.value })}
                    />
                    <input
                      className="input"
                      placeholder="Парт-номер"
                      value={newItem.partArticle}
                      onChange={(e) => setNewItem({ ...newItem, partArticle: e.target.value })}
                    />
                    <input
                      className="input"
                      inputMode="numeric"
                      placeholder="Цена, ₸*"
                      value={newItem.price}
                      onChange={(e) => setNewItem({ ...newItem, price: e.target.value })}
                    />
                    <input
                      className="input"
                      inputMode="numeric"
                      placeholder="Количество*"
                      value={newItem.quantity}
                      onChange={(e) => setNewItem({ ...newItem, quantity: e.target.value })}
                    />
                    <select
                      className="input sm:col-span-2"
                      value={newItem.source}
                      onChange={(e) => setNewItem({ ...newItem, source: e.target.value })}
                    >
                      <option value="">Склад (необязательно)</option>
                      {Array.from(new Set(warehouses.map((w) => w.sourceCode).filter(Boolean))).map((c) => (
                        <option key={c} value={c}>
                          склад {c}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button className="btn-secondary !px-3 !py-2 text-sm" onClick={() => setAdding(null)}>
                      <X className="h-4 w-4" /> Отмена
                    </button>
                    <button className="btn-primary !px-3 !py-2 text-sm" onClick={() => addItem(g)} disabled={saving === g.key}>
                      {saving === g.key ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                      Добавить
                    </button>
                  </div>
                </div>
              )}

              {g.vin && (
                <div className="mt-2 text-xs text-ink-mute dark:text-paper-mute [overflow-wrap:anywhere]">
                  Авто: {g.vehicle} · VIN{" "}
                  <code className="rounded bg-paper-soft px-1 font-mono text-ink dark:bg-ink dark:text-paper">{g.vin}</code>
                </div>
              )}

              {editing === g.key && (
                <div className="mt-3 space-y-3 rounded-2xl border border-paper-mute p-3 dark:border-ink-mute">
                  <div className="text-sm font-semibold">Тип получения и адрес (для всего заказа)</div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div>
                      <label className="label">Тип получения</label>
                      <select className="input" value={editType} onChange={(e) => setEditType(e.target.value)}>
                        {ORDER_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {t === "Экспресс" ? "Доставка (Экспресс)" : "Самовывоз"}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <label className="label">Адрес доставки</label>
                      <input
                        className="input"
                        value={editAddr}
                        onChange={(e) => setEditAddr(e.target.value)}
                        placeholder={editType === "Самовывоз" ? "Не нужен при самовывозе" : "г. Астана, ул. …"}
                        disabled={editType === "Самовывоз"}
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button className="btn-secondary !px-3 !py-2 text-sm" onClick={() => setEditing(null)}>
                      <X className="h-4 w-4" /> Отмена
                    </button>
                    <button className="btn-primary !px-3 !py-2 text-sm" onClick={() => saveEdit(g)} disabled={saving === g.key}>
                      {saving === g.key ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      Сохранить
                    </button>
                  </div>
                </div>
              )}

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-paper-mute/50 pt-3 dark:border-ink-mute/50">
                {g.whatsapp ? (
                  <a
                    href={`https://wa.me/${normalizePhoneE164(g.whatsapp)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-emerald-600"
                  >
                    <MessageCircle className="h-4 w-4" />
                    WhatsApp
                  </a>
                ) : (
                  <span className="text-xs text-ink-mute dark:text-paper-mute">WhatsApp не указан</span>
                )}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => createDelivery(g)}
                    disabled={saving === g.key}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-brand/40 px-3 py-1.5 text-sm font-semibold text-brand transition hover:bg-brand/10 disabled:opacity-50"
                  >
                    <Truck className="h-4 w-4" />
                    Создать доставку
                  </button>
                  <button
                    onClick={() => (adding === g.key ? setAdding(null) : startAdd(g))}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-paper-mute px-3 py-1.5 text-sm font-semibold transition hover:border-ink-mute dark:border-ink-mute"
                  >
                    <Plus className="h-4 w-4" />
                    Позиция
                  </button>
                  <button
                    onClick={() => (editing === g.key ? setEditing(null) : startEdit(g))}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-paper-mute px-3 py-1.5 text-sm font-semibold transition hover:border-ink-mute dark:border-ink-mute"
                  >
                    <Pencil className="h-4 w-4" />
                    Тип/адрес
                  </button>
                  <button
                    onClick={() => removeOrder(g)}
                    disabled={saving === g.key}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-brand/40 px-3 py-1.5 text-sm font-semibold text-brand transition hover:bg-brand/10 disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" />
                    Удалить
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
