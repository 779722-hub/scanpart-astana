"use client";

import { useEffect, useState } from "react";
import { Activity, CheckCircle2, XCircle, Loader2 } from "lucide-react";

interface Health {
  ok: boolean;
  version: string;
  timestamp: string;
  checks: Record<string, string>;
}

export function TabDashboard() {
  const [health, setHealth] = useState<Health | null>(null);
  const [orders, setOrders] = useState<{ count: number; today: number } | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((j) => setHealth(j as Health))
      .catch(() => setHealth(null));
    fetch("/api/admin/orders")
      .then((r) => r.json())
      .then((j) => {
        if (!j.ok) return;
        const today = new Date().toISOString().slice(0, 10);
        const todayCount = (j.orders as Array<{ date: string }>).filter((o) =>
          o.date.startsWith(today)
        ).length;
        setOrders({ count: j.orders.length, today: todayCount });
      })
      .catch(() => setOrders(null));
  }, []);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <div className="card">
        <div className="flex items-center gap-2 text-sm text-ink-mute dark:text-paper-mute">
          <Activity className="h-4 w-4" />
          Статус
        </div>
        <div className="mt-4 space-y-2">
          {health ? (
            Object.entries(health.checks).map(([k, v]) => (
              <Row key={k} label={k} ok={v === "ok" || v === "configured"} value={v} />
            ))
          ) : (
            <Loader2 className="h-5 w-5 animate-spin" />
          )}
        </div>
        {health && (
          <div className="mt-4 text-xs text-ink-mute dark:text-paper-mute">
            v{health.version} · {new Date(health.timestamp).toLocaleString("ru")}
          </div>
        )}
      </div>

      <div className="card">
        <div className="text-sm text-ink-mute dark:text-paper-mute">
          Заказов всего
        </div>
        <div className="mt-4 text-5xl font-black text-brand">
          {orders?.count ?? "—"}
        </div>
      </div>

      <div className="card">
        <div className="text-sm text-ink-mute dark:text-paper-mute">
          Сегодня
        </div>
        <div className="mt-4 text-5xl font-black">{orders?.today ?? "—"}</div>
      </div>
    </div>
  );
}

function Row({ label, ok, value }: { label: string; ok: boolean; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className="capitalize">{label}</span>
      <span
        className={
          ok ? "inline-flex items-center gap-1 text-emerald-600" : "inline-flex items-center gap-1 text-brand"
        }
      >
        {ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
        {value}
      </span>
    </div>
  );
}
