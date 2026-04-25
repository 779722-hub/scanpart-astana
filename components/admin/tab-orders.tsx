"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Package, Search } from "lucide-react";

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
          o.phone.toLowerCase().includes(needle) ||
          o.clientName.toLowerCase().includes(needle) ||
          o.vin.toLowerCase().includes(needle) ||
          o.partArticle.toLowerCase().includes(needle)
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
          placeholder="Поиск: телефон, имя, VIN, парт-номер"
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
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
