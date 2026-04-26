"use client";

import { useEffect, useState } from "react";
import {
  Loader2,
  Save,
  Plus,
  Trash2,
  CheckCircle2,
  BookOpen,
  Pencil,
  X,
} from "lucide-react";

interface AliasRow {
  rowNumber: number;
  query: string;
  make: string;
  articles: string;
  updatedAt: string;
  updatedBy: string;
}

export function TabAliases() {
  const [rows, setRows] = useState<AliasRow[] | null>(null);
  const [filter, setFilter] = useState("");
  const [adding, setAdding] = useState(false);

  async function refresh() {
    const r = await fetch("/api/admin/aliases");
    const j = await r.json();
    setRows(j.ok ? j.rows : []);
  }

  useEffect(() => {
    refresh();
  }, []);

  if (!rows) {
    return (
      <div className="card flex justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  const filtered = filter
    ? rows.filter(
        (r) =>
          r.query.toLowerCase().includes(filter.toLowerCase()) ||
          r.make.toLowerCase().includes(filter.toLowerCase()) ||
          r.articles.toLowerCase().includes(filter.toLowerCase())
      )
    : rows;

  return (
    <div className="space-y-4">
      <div className="card space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <BookOpen className="h-5 w-5 text-brand" />
          <h2 className="text-lg font-bold">Словарь синонимов поиска по названию</h2>
          <p className="w-full text-sm text-ink-mute dark:text-paper-mute sm:flex-1 sm:w-auto">
            Phaeton не умеет искать по словам. Здесь вы сопоставляете
            «колодки передние» → конкретные парт-номера. Если у клиента
            определён VIN, словарь учитывает марку.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <input
            className="input flex-1 min-w-[12rem]"
            placeholder="Фильтр по запросу / марке / парт-номеру"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <button
            onClick={() => setAdding((v) => !v)}
            className="btn-secondary !px-3 !py-2 text-sm"
          >
            <Plus className="h-4 w-4" />
            {adding ? "Отмена" : "Добавить запись"}
          </button>
        </div>
        <details className="rounded-2xl bg-paper-soft p-3 text-xs dark:bg-ink-mute">
          <summary className="cursor-pointer font-semibold">Как заполнять</summary>
          <div className="mt-2 space-y-1 text-ink-mute dark:text-paper-mute">
            <p>
              <strong>Запрос</strong> — что вводит клиент в поле поиска по
              названию. Достаточно базовой формы: «колодки передние» подойдёт
              и для «передние тормозные колодки», и для «колодки» отдельно.
            </p>
            <p>
              <strong>Марка</strong> — необязательно. Если заполнено, запись
              сработает только когда у клиента в сессии указано это авто.
              Пусто — для любого авто.
            </p>
            <p>
              <strong>Парт-номера</strong> — список через запятую или с
              новой строки в формате <code>BRAND|ARTICLE</code>. Пример:
              {" "}<code>TRW|GDB3458, FEBI|16573, NISSAN|410601</code>.
            </p>
          </div>
        </details>
      </div>

      {adding && (
        <AliasForm
          onCancel={() => setAdding(false)}
          onSave={async (form) => {
            const r = await fetch("/api/admin/aliases", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(form),
            });
            if (!r.ok) {
              alert("Не удалось сохранить запись");
              return;
            }
            setAdding(false);
            await refresh();
          }}
        />
      )}

      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="card text-center text-sm text-ink-mute">
            {rows.length === 0
              ? "Словарь пуст. Добавьте первую запись — например, «колодки передние» → TRW|GDB3458."
              : "Ничего не найдено по фильтру."}
          </div>
        ) : (
          filtered.map((r) => (
            <AliasRowEditor
              key={r.rowNumber}
              row={r}
              onChanged={refresh}
            />
          ))
        )}
      </div>
    </div>
  );
}

function AliasRowEditor({
  row,
  onChanged,
}: {
  row: AliasRow;
  onChanged: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);

  async function remove() {
    if (!confirm(`Удалить запись «${row.query}»?`)) return;
    await fetch("/api/admin/aliases", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rowNumber: row.rowNumber }),
    });
    await onChanged();
  }

  if (editing) {
    return (
      <AliasForm
        initial={row}
        onCancel={() => setEditing(false)}
        onSave={async (form) => {
          const r = await fetch("/api/admin/aliases", {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ rowNumber: row.rowNumber, ...form }),
          });
          if (!r.ok) {
            alert("Не удалось обновить запись");
            return;
          }
          setEditing(false);
          await onChanged();
        }}
      />
    );
  }

  const articles = row.articles
    .split(/[,\n;]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  return (
    <div className="card space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="text-base font-bold">{row.query}</div>
          {row.make && (
            <span className="chip bg-paper-soft text-ink-mute dark:bg-ink-mute dark:text-paper-mute">
              Марка: {row.make}
            </span>
          )}
          <div className="flex flex-wrap gap-1.5 pt-1">
            {articles.map((a, i) => (
              <code
                key={i}
                className="rounded-lg bg-paper-soft px-2 py-1 font-mono text-xs dark:bg-ink-mute"
              >
                {a}
              </code>
            ))}
          </div>
        </div>
        <div className="flex flex-none gap-2">
          <button
            onClick={() => setEditing(true)}
            className="btn-secondary !px-3 !py-2 text-sm"
            aria-label="Редактировать"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            onClick={remove}
            className="inline-flex items-center justify-center gap-1.5 rounded-2xl border-2 border-brand/40 bg-brand/5 px-3 py-2 text-sm font-semibold text-brand transition hover:border-brand hover:bg-brand/10"
            aria-label="Удалить"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

interface AliasFormValues {
  query: string;
  make: string;
  articles: string;
}

function AliasForm({
  initial,
  onCancel,
  onSave,
}: {
  initial?: AliasFormValues;
  onCancel: () => void;
  onSave: (form: AliasFormValues) => Promise<void>;
}) {
  const [query, setQuery] = useState(initial?.query ?? "");
  const [make, setMake] = useState(initial?.make ?? "");
  const [articles, setArticles] = useState(initial?.articles ?? "");
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="card space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!query.trim() || !articles.trim()) {
          alert("Заполните «Запрос» и «Парт-номера».");
          return;
        }
        setBusy(true);
        try {
          await onSave({
            query: query.trim(),
            make: make.trim(),
            articles: articles.trim(),
          });
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Запрос (что вводит клиент)</label>
          <input
            className="input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="колодки передние"
            autoFocus
            required
          />
        </div>
        <div>
          <label className="label">Марка авто (необязательно)</label>
          <input
            className="input"
            value={make}
            onChange={(e) => setMake(e.target.value)}
            placeholder="Toyota"
          />
        </div>
      </div>
      <div>
        <label className="label">Парт-номера</label>
        <textarea
          className="input min-h-[7rem] font-mono text-sm"
          value={articles}
          onChange={(e) => setArticles(e.target.value)}
          placeholder={"TRW|GDB3458\nFEBI|16573\nNISSAN|410601"}
          required
        />
        <p className="mt-1 text-xs text-ink-mute dark:text-paper-mute">
          Через запятую или с новой строки. Формат: BRAND|ARTICLE.
        </p>
      </div>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="btn-secondary !px-4 !py-2 text-sm"
        >
          <X className="h-4 w-4" /> Отмена
        </button>
        <button className="btn-primary !px-4 !py-2 text-sm" disabled={busy}>
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <CheckCircle2 className="h-4 w-4" />
              <Save className="h-4 w-4" /> Сохранить
            </>
          )}
        </button>
      </div>
    </form>
  );
}
