"use client";

import { useEffect, useState } from "react";
import {
  Loader2,
  Search,
  AlertTriangle,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";

interface AggregatedRow {
  norm: string;
  query: string;
  total: number;
  empty: number;
  lastTimestamp: string;
  makes: { make: string; count: number }[];
}

export function TabSearchLog() {
  const [rows, setRows] = useState<AggregatedRow[] | null>(null);
  const [filter, setFilter] = useState<"empty" | "all">("empty");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setBusy(true);
    try {
      const r = await fetch("/api/admin/search-log");
      const j = await r.json();
      setRows(j.ok ? j.aggregated : []);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function clearAll() {
    if (!confirm("Стереть весь журнал поисков?")) return;
    await fetch("/api/admin/search-log", { method: "DELETE" });
    refresh();
  }

  if (!rows) {
    return (
      <div className="card flex justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  const visible =
    filter === "empty" ? rows.filter((r) => r.empty > 0) : rows;

  return (
    <div className="space-y-4">
      <div className="card space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Search className="h-5 w-5 text-brand" />
          <h2 className="text-lg font-bold">Что искали по названию</h2>
          <p className="w-full text-sm text-ink-mute dark:text-paper-mute sm:flex-1 sm:w-auto">
            Журнал реальных поисковых запросов клиентов. «Не нашли» —
            кандидаты на добавление в словарь синонимов: один раз внесли
            и закрыли N будущих клиентов.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div role="radiogroup" className="inline-flex rounded-2xl border border-paper-mute p-1 dark:border-ink-mute">
            <FilterChip
              checked={filter === "empty"}
              onClick={() => setFilter("empty")}
              label="Не нашли"
            />
            <FilterChip
              checked={filter === "all"}
              onClick={() => setFilter("all")}
              label="Все"
            />
          </div>
          <button onClick={refresh} disabled={busy} className="btn-secondary !px-3 !py-2 text-sm">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Обновить
          </button>
          <button
            onClick={clearAll}
            className="inline-flex items-center justify-center gap-1.5 rounded-2xl border-2 border-brand/40 bg-brand/5 px-3 py-2 text-sm font-semibold text-brand transition hover:border-brand hover:bg-brand/10"
          >
            <Trash2 className="h-4 w-4" />
            Очистить журнал
          </button>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="card text-center text-sm text-ink-mute dark:text-paper-mute">
          {rows.length === 0
            ? "Журнал пуст. Здесь будут появляться запросы клиентов с момента деплоя."
            : "Все поиски находили результаты. Отлично!"}
        </div>
      ) : (
        <ul className="space-y-2">
          {visible.map((r) => (
            <SearchLogRowCard key={r.norm} row={r} />
          ))}
        </ul>
      )}
    </div>
  );
}

function FilterChip({
  checked,
  onClick,
  label,
}: {
  checked: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      role="radio"
      aria-checked={checked}
      onClick={onClick}
      className={
        "rounded-xl px-3 py-1.5 text-sm font-semibold transition " +
        (checked
          ? "bg-brand text-white"
          : "text-ink-mute hover:bg-paper dark:text-paper-mute dark:hover:bg-ink")
      }
    >
      {label}
    </button>
  );
}

function SearchLogRowCard({ row }: { row: AggregatedRow }) {
  const [adding, setAdding] = useState(false);
  const [articles, setArticles] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function addToDictionary(make: string) {
    if (!articles.trim()) {
      alert("Сначала впишите парт-номера в формате BRAND|ARTICLE.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/aliases", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          query: row.query,
          make,
          articles: articles.trim(),
        }),
      });
      if (!res.ok) {
        alert("Не удалось добавить запись в словарь");
        return;
      }
      setDone(true);
      setAdding(false);
    } finally {
      setBusy(false);
    }
  }

  const failureRatio = row.total > 0 ? Math.round((row.empty / row.total) * 100) : 0;

  return (
    <li className="card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-base font-bold">{row.query}</span>
            {row.empty > 0 && (
              <span className="chip bg-brand/10 text-brand">
                <AlertTriangle className="h-3 w-3" /> не нашли × {row.empty}
              </span>
            )}
            <span className="chip bg-paper-soft text-ink-mute dark:bg-ink-mute dark:text-paper-mute">
              всего × {row.total}
            </span>
            {row.empty > 0 && (
              <span className="chip bg-paper-soft text-ink-mute dark:bg-ink-mute dark:text-paper-mute">
                {failureRatio}% провалов
              </span>
            )}
          </div>
          {row.makes.length > 0 && (
            <div className="flex flex-wrap gap-1.5 text-xs">
              {row.makes.slice(0, 6).map((m) => (
                <span
                  key={m.make}
                  className="rounded-lg bg-paper-soft px-2 py-0.5 dark:bg-ink-mute"
                >
                  {m.make} × {m.count}
                </span>
              ))}
            </div>
          )}
          <div className="text-xs text-ink-mute dark:text-paper-mute">
            последний раз: {new Date(row.lastTimestamp).toLocaleString("ru")}
          </div>
        </div>
        <div className="flex flex-none gap-2">
          {done ? (
            <span className="chip bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
              Добавлено в словарь
            </span>
          ) : (
            <button
              onClick={() => setAdding((v) => !v)}
              className="btn-secondary !px-3 !py-2 text-sm"
            >
              <Plus className="h-4 w-4" />
              {adding ? "Отмена" : "В словарь"}
            </button>
          )}
        </div>
      </div>

      {adding && (
        <div className="mt-3 rounded-2xl bg-paper-soft p-3 dark:bg-ink-mute">
          <div className="text-xs text-ink-mute dark:text-paper-mute mb-2">
            Впишите парт-номера через запятую или с новой строки
            (формат <code>BRAND|ARTICLE</code>), потом выберите марку:
          </div>
          <textarea
            className="input min-h-[5rem] font-mono text-xs"
            value={articles}
            onChange={(e) => setArticles(e.target.value)}
            placeholder={"TRW|GDB3458, FEBI|16573"}
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              onClick={() => addToDictionary("")}
              disabled={busy}
              className="btn-secondary !px-3 !py-2 text-xs"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Для всех марок"}
            </button>
            {row.makes.slice(0, 4).map((m) => (
              <button
                key={m.make}
                onClick={() => addToDictionary(m.make)}
                disabled={busy}
                className="btn-primary !px-3 !py-2 text-xs"
              >
                Только {m.make}
              </button>
            ))}
          </div>
        </div>
      )}
    </li>
  );
}
