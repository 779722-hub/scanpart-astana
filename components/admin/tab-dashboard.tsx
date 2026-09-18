"use client";

import { useEffect, useState } from "react";
import { Activity, CheckCircle2, XCircle, MinusCircle, Loader2 } from "lucide-react";

interface Health {
  ok: boolean;
  version: string;
  timestamp: string;
  checks: Record<string, string>;
}

// Подписи строк на русском. Названия складов/поставщиков (Р1/М2/Т3/И6) НЕ
// переводим — это опознаваемые коды/имена.
const STATUS_LABELS: Record<string, string> = {
  phaeton: "Phaeton (Р1)",
  shatem: "Shate-M (М2)",
  autotrade: "Autotrade (Т3)",
  interkom: "Interkom (И6)",
  proxy: "Прокси",
  sheets: "Google Таблицы",
  cloudinary: "Хранилище фото",
  telegram: "Телеграм",
};

// Единые подписи статусов на русском для ВСЕХ строк — чтобы везде было
// одинаково «работает / не работает», а не смесь «работает» и «ok».
const VALUE_RU: Record<string, string> = {
  ok: "работает",
  configured: "работает",
  up: "работает",
  fail: "не работает",
  down: "не работает",
  invalid: "не работает",
  unreachable: "не работает",
  "no-chat": "не работает",
  missing: "не настроено",
  off: "выключено",
  unknown: "нет данных",
};

// Тон строки: зелёный (работает), красный (не работает), серый (не активно/нет данных).
function toneFor(v: string): "ok" | "bad" | "muted" {
  if (v === "ok" || v === "configured" || v === "up") return "ok";
  if (v === "off" || v === "missing" || v === "unknown") return "muted";
  return "bad"; // fail / down / invalid / unreachable / no-chat
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
                value={VALUE_RU[v] ?? v}
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
