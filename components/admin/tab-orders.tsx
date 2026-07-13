"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Package, Search, Trash2, MessageCircle, Pencil, Save, X, Truck } from "lucide-react";
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
}

const STATUSES = ["Новый", "В работе", "Выполнен", "Отменён"];

export function TabOrders() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [q, setQ] = useState("");
  const [savingRow, setSavingRow] = useState<number | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [editType, setEditType] = useState<string>("Экспресс");
  const [editAddr, setEditAddr] = useState<string>("");

  useEffect(() => {
    refresh();
  }, []);

  async function refresh() {
    const j = await fetch("/api/admin/orders").then((r) => r.json());
    setOrders(j.ok ? (j.orders as Order[]) : []);
  }

  const filtered = useMemo(() => {
    if (!orders) return [];
    const needle = q.trim().toLowerCase();
    if (!needle) return orders.slice().reverse();
    return orders
      .filter(
        (o) =>
          o.partName.toLowerCase().includes(needle) ||
          o.brand.toLowerCase().includes(needle) ||
          o.partArticle.toLowerCase().includes(needle) ||
          o.clientName.toLowerCase().includes(needle) ||
          o.phone.toLowerCase().includes(needle) ||
          o.vin.toLowerCase().includes(needle) ||
          o.vehicle.toLowerCase().includes(needle)
      )
      .reverse();
  }, [orders, q]);

  async function setStatus(row: number, status: string) {
    setSavingRow(row);
    try {
      await fetch(`/api/admin/orders/${row}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      });
      setOrders(
        (cur) => cur?.map((o) => (o.rowNumber === row ? { ...o, status } : o)) ?? null
      );
    } finally {
      setSavingRow(null);
    }
  }

  function startEdit(o: Order) {
    setEditing(o.rowNumber);
    setEditType(ORDER_TYPES.includes(o.orderType as (typeof ORDER_TYPES)[number]) ? o.orderType : "Экспресс");
    setEditAddr(o.address);
  }

  async function saveEdit(row: number) {
    setSavingRow(row);
    try {
      const address = editType === "Самовывоз" ? "" : editAddr.trim();
      await fetch(`/api/admin/orders/${row}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderType: editType, address }),
      });
      setOrders(
        (cur) =>
          cur?.map((o) => (o.rowNumber === row ? { ...o, orderType: editType, address } : o)) ??
          null
      );
      setEditing(null);
    } finally {
      setSavingRow(null);
    }
  }

  async function createDelivery(o: Order) {
    if (!confirm(`Создать доставку для «${o.clientName || o.phone}»? Курьера и координаты назначьте во вкладке «Доставки».`)) return;
    setSavingRow(o.rowNumber);
    try {
      const items = `${o.partName}${o.quantity > 1 ? ` ×${o.quantity}` : ""}`;
      const res = await fetch("/api/admin/deliveries", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          customerName: o.clientName,
          phone: o.phone,
          whatsapp: o.whatsapp,
          address: o.address,
          items,
        }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) {
        alert(`Ошибка: ${j.error}`);
        return;
      }
      alert("Доставка создана. Откройте вкладку «Доставки», задайте координаты и назначьте курьера.");
    } finally {
      setSavingRow(null);
    }
  }

  async function removeOrder(row: number) {
    if (!confirm("Удалить этот заказ безвозвратно?")) return;
    setSavingRow(row);
    try {
      await fetch(`/api/admin/orders/${row}`, { method: "DELETE" });
      // Row numbers shift after a delete — re-read to stay in sync.
      await refresh();
    } finally {
      setSavingRow(null);
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
          {filtered.length}/{orders.length}
        </p>
      </div>

      {filtered.length === 0 ? (
        <div className="card text-center text-sm text-ink-mute">
          <Package className="mx-auto mb-2 h-8 w-8" />
          Заказов нет.
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((o) => (
            <article key={o.rowNumber} className="card">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="text-xs text-ink-mute dark:text-paper-mute">
                    {new Date(o.date).toLocaleString("ru")} · #{o.rowNumber}
                  </div>
                  <div className="text-lg font-bold">{o.clientName || "—"}</div>
                  <div className="text-sm text-ink-mute dark:text-paper-mute">
                    {o.phone} · {o.orderType}
                    {o.address ? ` · ${o.address}` : ""}
                  </div>
                </div>
                <select
                  className="input !w-auto !py-2 text-sm"
                  value={o.status}
                  onChange={(e) => setStatus(o.rowNumber, e.target.value)}
                  disabled={savingRow === o.rowNumber}
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
                <div>
                  <span className="text-ink-mute dark:text-paper-mute">Запчасть:</span>{" "}
                  <strong>{o.partName}</strong>
                </div>
                <div>
                  <span className="text-ink-mute dark:text-paper-mute">Бренд:</span>{" "}
                  {o.brand} · <code className="font-mono">{o.partArticle}</code>
                </div>
                <div>
                  <span className="text-ink-mute dark:text-paper-mute">Цена:</span>{" "}
                  <strong>{new Intl.NumberFormat("ru-RU").format(o.price)} ₸</strong>{" "}
                  × {o.quantity}
                </div>
                {o.vin && (
                  <div className="sm:col-span-3 text-xs text-ink-mute">
                    Авто: {o.vehicle} · VIN <code>{o.vin}</code>
                  </div>
                )}
              </div>

              {editing === o.rowNumber && (
                <div className="mt-3 space-y-3 rounded-2xl border border-paper-mute p-3 dark:border-ink-mute">
                  <div className="text-sm font-semibold">Тип получения и адрес</div>
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
                    <button
                      className="btn-primary !px-3 !py-2 text-sm"
                      onClick={() => saveEdit(o.rowNumber)}
                      disabled={savingRow === o.rowNumber}
                    >
                      {savingRow === o.rowNumber ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      Сохранить
                    </button>
                  </div>
                </div>
              )}

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-paper-mute/50 pt-3 dark:border-ink-mute/50">
                {o.whatsapp ? (
                  <a
                    href={`https://wa.me/${normalizePhoneE164(o.whatsapp)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-emerald-600"
                  >
                    <MessageCircle className="h-4 w-4" />
                    WhatsApp
                  </a>
                ) : (
                  <span className="text-xs text-ink-mute dark:text-paper-mute">
                    WhatsApp не указан
                  </span>
                )}
                <div className="flex items-center gap-2">
                  {o.orderType !== "Самовывоз" && (
                    <button
                      onClick={() => createDelivery(o)}
                      disabled={savingRow === o.rowNumber}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-brand/40 px-3 py-1.5 text-sm font-semibold text-brand transition hover:bg-brand/10 disabled:opacity-50"
                    >
                      <Truck className="h-4 w-4" />
                      Создать доставку
                    </button>
                  )}
                  <button
                    onClick={() => (editing === o.rowNumber ? setEditing(null) : startEdit(o))}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-paper-mute px-3 py-1.5 text-sm font-semibold transition hover:border-ink-mute dark:border-ink-mute"
                  >
                    <Pencil className="h-4 w-4" />
                    Тип/адрес
                  </button>
                  <button
                    onClick={() => removeOrder(o.rowNumber)}
                    disabled={savingRow === o.rowNumber}
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
