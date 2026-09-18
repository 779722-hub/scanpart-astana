"use client";

import { useEffect, useState } from "react";
import { Activity, CheckCircle2, XCircle, MinusCircle, Loader2 } from "lucide-react";

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

// Поставщики (Р1/М2/Т3/И6): честный статус из реальной пробы (крон proxy-check).
// Р1 — по наличию сентинелов; М2/Т3/И6 — по доступности (auth/сессия/сеть).
// «нет данных» — крон ещё не проверял; «выключен» — Interkom off тумблером.
const SUPPLIER_VALUE_RU: Record<string, string> = {
  ok: "работает",
  fail: "не работает",
  unknown: "нет данных",
  missing: "не настроен",
  off: "выключен",
};
const SUPPLIER_KEYS = new Set(["phaeton", "shatem", "autotrade", "interkom"]);

// Telegram: показываем причину, а не голое «fail».
const TELEGRAM_VALUE_RU: Record<string, string> = {
  ok: "работает",
  invalid: "неверный токен",
  unreachable: "нет связи с Telegram",
  "no-chat": "не задан chat id",
  missing: "не настроен",
};

// Тон строки: зелёный (ок), красный (сломано), серый (не активно/нет данных/транзиент).
function toneFor(v: string): "ok" | "bad" | "muted" {
  if (v === "ok" || v === "configured") return "ok";
  if (v === "off" || v === "missing" || v === "unknown" || v === "unreachable")
    return "muted";
  return "bad"; // fail / invalid / no-chat
}

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
                tone={toneFor(v)}
                value={
                  k === "proxy"
                    ? PROXY_VALUE_RU[v] ?? v
                    : k === "telegram"
                      ? TELEGRAM_VALUE_RU[v] ?? v
                      : SUPPLIER_KEYS.has(k)
                        ? SUPPLIER_VALUE_RU[v] ?? v
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

function Row({
  label,
  tone,
  value,
}: {
  label: string;
  tone: "ok" | "bad" | "muted";
  value: string;
}) {
  const color =
    tone === "ok"
      ? "text-emerald-600"
      : tone === "bad"
        ? "text-brand"
        : "text-ink-mute dark:text-paper-mute";
  const Icon = tone === "ok" ? CheckCircle2 : tone === "bad" ? XCircle : MinusCircle;
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className="capitalize">{label}</span>
      <span className={`inline-flex items-center gap-1 ${color}`}>
        <Icon className="h-4 w-4" />
        {value}
      </span>
    </div>
  );
}
