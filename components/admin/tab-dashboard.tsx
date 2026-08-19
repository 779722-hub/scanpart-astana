"use client";

import { useEffect, useState } from "react";
import { Activity, CheckCircle2, XCircle, Loader2 } from "lucide-react";

interface Health {
  ok: boolean;
  version: string;
  timestamp: string;
  checks: Record<string, string>;
}

// Admin-only view — supplier names + their opaque customer codes are fine here.
const STATUS_LABELS: Record<string, string> = {
  phaeton: "Phaeton (Р1)",
  shatem: "Shate-M (М2)",
  autotrade: "Autotrade (Т3)",
  interkom: "Interkom (И6)",
  proxy: "Прокси",
  sheets: "Google Sheets",
  cloudinary: "Cloudinary",
  telegram: "Telegram",
};

// Прокси — единый канал всех поставщиков, показываем словами, а не «ok/fail».
const PROXY_VALUE_RU: Record<string, string> = {
  ok: "работает",
  fail: "не работает",
  missing: "не настроен",
};

// Interkom: подключён (креды + включён), выключен (креды есть, тумблер off),
// не настроен (нет логина/пароля).
const INTERKOM_VALUE_RU: Record<string, string> = {
  ok: "подключён",
  off: "выключен",
  missing: "не настроен",
};

export function TabDashboard({ onOpenOrders }: { onOpenOrders: () => void }) {
  const [health, setHealth] = useState<Health | null>(null);
  const [orders, setOrders] = useState<{ count: number; today: number } | null>(null);

  // Статус живой: перечитываем каждые 30 с и при возврате на вкладку, иначе
  // панель показывает картину на момент открытия админки.
  useEffect(() => {
    let stop = false;
    const pull = () => {
      fetch("/api/health", { cache: "no-store" })
        .then((r) => r.json())
        .then((j) => {
          if (!stop) setHealth(j as Health);
        })
        .catch(() => {
          if (!stop) setHealth(null);
        });
    };
    pull();
    const id = setInterval(pull, 30_000);
    const onFocus = () => {
      if (document.visibilityState === "visible") pull();
    };
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      stop = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, []);

  useEffect(() => {
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
              <Row
                key={k}
                label={STATUS_LABELS[k] ?? k}
                ok={v === "ok" || v === "configured"}
                value={
                  k === "proxy"
                    ? PROXY_VALUE_RU[v] ?? v
                    : k === "interkom"
                      ? INTERKOM_VALUE_RU[v] ?? v
                      : v
                }
              />
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

      <button
        onClick={onOpenOrders}
        className="card text-left transition hover:-translate-y-0.5 hover:shadow-cardHover"
      >
        <div className="flex items-center justify-between text-sm text-ink-mute dark:text-paper-mute">
          <span>Заказов всего</span>
          <span className="text-brand">Открыть →</span>
        </div>
        <div className="mt-4 text-5xl font-bold tabular-nums text-brand">
          {orders?.count ?? "—"}
        </div>
      </button>

      <button
        onClick={onOpenOrders}
        className="card text-left transition hover:-translate-y-0.5 hover:shadow-cardHover"
      >
        <div className="flex items-center justify-between text-sm text-ink-mute dark:text-paper-mute">
          <span>Заказы сегодня</span>
          <span className="text-brand">Открыть →</span>
        </div>
        <div className="mt-4 text-5xl font-bold tabular-nums">{orders?.today ?? "—"}</div>
      </button>
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
