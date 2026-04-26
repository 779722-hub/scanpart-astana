"use client";

import { useEffect, useState } from "react";
import { Loader2, Save, CheckCircle2, Plus } from "lucide-react";
import { cn } from "@/lib/cn";

interface ContentRow {
  key: string;
  ru: string;
  kk: string;
  en: string;
  where?: string;
}

type Locale = "ru" | "kk" | "en";

export function TabContent() {
  const [rows, setRows] = useState<ContentRow[] | null>(null);
  const [locale, setLocale] = useState<Locale>("ru");
  const [filter, setFilter] = useState("");
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newKey, setNewKey] = useState("");

  useEffect(() => {
    fetch("/api/admin/content")
      .then((r) => r.json())
      .then((j) => setRows(j.ok ? j.rows : []))
      .catch(() => setRows([]));
  }, []);

  if (!rows) {
    return (
      <div className="card flex justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  const filtered = rows.filter((r) =>
    r.key.toLowerCase().includes(filter.toLowerCase())
  );

  async function save(row: ContentRow, value: string) {
    setSavingKey(row.key);
    try {
      const res = await fetch("/api/admin/content", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: row.key, locale, value }),
      });
      if (!res.ok) throw new Error();
      setRows((cur) =>
        cur?.map((r) => (r.key === row.key ? { ...r, [locale]: value } : r)) ?? null
      );
      setSavedKey(row.key);
      setTimeout(() => setSavedKey((k) => (k === row.key ? null : k)), 1500);
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-center gap-3">
        <div role="radiogroup" className="inline-flex rounded-2xl border border-paper-mute p-1 dark:border-ink-mute">
          {(["ru", "kk", "en"] as Locale[]).map((l) => (
            <button
              key={l}
              role="radio"
              aria-checked={locale === l}
              onClick={() => setLocale(l)}
              className={cn(
                "rounded-xl px-3 py-1.5 text-sm font-semibold uppercase transition",
                locale === l
                  ? "bg-brand text-white"
                  : "text-ink-mute hover:bg-paper dark:text-paper-mute dark:hover:bg-ink"
              )}
            >
              {l}
            </button>
          ))}
        </div>
        <input
          className="input flex-1 min-w-[12rem]"
          placeholder="Поиск по ключу (например, home.title)"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <p className="text-xs text-ink-mute dark:text-paper-mute">
          {filtered.length}/{rows.length} ключей
        </p>
        <button
          onClick={() => setAdding((v) => !v)}
          className="btn-secondary !px-3 !py-2 text-sm"
        >
          <Plus className="h-4 w-4" />
          {adding ? "Отмена" : "Добавить ключ"}
        </button>
      </div>

      {adding && (
        <form
          className="card flex flex-wrap items-end gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const key = newKey.trim();
            if (!/^[a-zA-Z0-9._-]{2,120}$/.test(key)) {
              alert("Ключ: латиница, цифры, точка, дефис; 2–120 символов.");
              return;
            }
            if (rows.some((r) => r.key === key)) {
              alert("Такой ключ уже есть.");
              return;
            }
            // Create with empty values for all locales — admin then edits below.
            await fetch("/api/admin/content", {
              method: "PUT",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ key, locale: "ru", value: "" }),
            });
            setRows((cur) =>
              cur ? [...cur, { key, ru: "", kk: "", en: "" }].sort((a, b) => a.key.localeCompare(b.key)) : cur
            );
            setFilter(key);
            setNewKey("");
            setAdding(false);
          }}
        >
          <div className="flex-1 min-w-[12rem]">
            <label className="label">Новый ключ</label>
            <input
              className="input font-mono"
              autoFocus
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              placeholder="например, results.catalogHintTitle"
              pattern="[a-zA-Z0-9._-]{2,120}"
              required
            />
          </div>
          <button className="btn-primary !px-4 !py-2 text-sm">
            Создать
          </button>
        </form>
      )}

      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="card text-center text-sm text-ink-mute">
            Контент пуст. Запусти `scripts/seed-content.ts`, чтобы залить ключи из messages/*.json в Sheets, либо добавь руками.
          </div>
        ) : (
          filtered.map((row) => (
            <ContentEditor
              key={row.key}
              row={row}
              locale={locale}
              onSave={(v) => save(row, v)}
              saving={savingKey === row.key}
              saved={savedKey === row.key}
            />
          ))
        )}
      </div>
    </div>
  );
}

function ContentEditor({
  row,
  locale,
  onSave,
  saving,
  saved,
}: {
  row: ContentRow;
  locale: Locale;
  onSave: (value: string) => void | Promise<void>;
  saving: boolean;
  saved: boolean;
}) {
  const [value, setValue] = useState(row[locale]);
  const dirty = value !== row[locale];
  const isLong = (row[locale] ?? "").length > 80 || value.length > 80;
  return (
    <div className="card space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <code className="rounded bg-paper-soft px-2 py-1 text-xs dark:bg-ink-mute">
          {row.key}
        </code>
        {dirty && (
          <span className="text-xs text-amber-600">несохранённые изменения</span>
        )}
      </div>
      {row.where && (
        <div className="text-xs text-ink-mute dark:text-paper-mute">
          📍 Где: {row.where}
        </div>
      )}
      {isLong ? (
        <textarea
          className="input min-h-[6rem]"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={`Перевод (${locale.toUpperCase()})`}
        />
      ) : (
        <input
          className="input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={`Перевод (${locale.toUpperCase()})`}
        />
      )}
      <div className="flex justify-end">
        <button
          onClick={() => dirty && onSave(value)}
          disabled={!dirty || saving}
          className="btn-primary !px-4 !py-2 text-sm"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : saved ? (
            <>
              <CheckCircle2 className="h-4 w-4" /> Сохранено
            </>
          ) : (
            <>
              <Save className="h-4 w-4" /> Сохранить
            </>
          )}
        </button>
      </div>
    </div>
  );
}
