"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Save, CheckCircle2, Plus, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

interface ContentRow {
  key: string;
  ru: string;
  kk: string;
  en: string;
  where?: string;
}

type Locale = "ru" | "kk" | "en";

const GROUP_LABELS: Record<string, string> = {
  brand: "🏷 Бренд / шапка / подвал",
  nav: "🧭 Навигация",
  home: "🏠 Главная страница",
  vin: "🔎 Поиск по VIN",
  article: "🔢 Поиск по парт-номеру",
  name: "📝 Поиск по названию",
  results: "📦 Страница результатов поиска",
  order: "🛒 Форма заказа (Экспресс / Самовывоз)",
  info: "ℹ️ Страница «Доп. информация»",
  errors: "⚠️ Сообщения об ошибках",
  admin: "🛠 Админ-панель",
};

function groupOf(key: string): string {
  return key.split(".")[0] || "other";
}
function groupLabel(g: string): string {
  return GROUP_LABELS[g] ?? `📁 ${g}`;
}

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

  // Group by prefix; sort groups by label, items inside by key. Hooks must be
  // unconditional → compute even when rows is null (yields empty list).
  const grouped = useMemo(() => {
    if (!rows) return [];
    const filtered = rows.filter((r) =>
      r.key.toLowerCase().includes(filter.toLowerCase())
    );
    const map = new Map<string, ContentRow[]>();
    for (const r of filtered) {
      const g = groupOf(r.key);
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(r);
    }
    return [...map.entries()]
      .map(([g, items]) => ({
        group: g,
        label: groupLabel(g),
        items: items.sort((a, b) => a.key.localeCompare(b.key)),
      }))
      .sort((a, b) => a.label.localeCompare(b.label, "ru"));
  }, [rows, filter]);

  if (!rows) {
    return (
      <div className="card flex justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  const filteredCount = grouped.reduce((s, g) => s + g.items.length, 0);

  async function save(row: ContentRow, value: string) {
    setSavingKey(row.key);
    try {
      const res = await fetch("/api/admin/content", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: row.key, locale, value }),
      });
      if (!res.ok) throw new Error();
      const j = (await res.json().catch(() => ({}))) as {
        translations?: { kk: string; en: string };
      };
      setRows((cur) =>
        cur?.map((r) => {
          if (r.key !== row.key) return r;
          const next = { ...r, [locale]: value };
          // RU save auto-fills KK/EN (Google Translate) — reflect it instantly.
          if (j.translations) {
            next.kk = j.translations.kk;
            next.en = j.translations.en;
          }
          return next;
        }) ?? null
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
          {filteredCount}/{rows.length} ключей
        </p>
        {locale === "ru" && (
          <p className="w-full text-xs text-brand">
            При сохранении русского текста казахский и английский переводятся автоматически.
          </p>
        )}
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

      <div className="space-y-3">
        {grouped.length === 0 ? (
          <div className="card text-center text-sm text-ink-mute">
            Контент пуст или ничего не найдено по фильтру.
          </div>
        ) : (
          grouped.map(({ group, label, items }) => (
            <ContentGroup
              key={group}
              label={label}
              count={items.length}
              defaultOpen={Boolean(filter) || grouped.length === 1}
            >
              {items.map((row) => (
                <ContentEditor
                  key={row.key}
                  row={row}
                  locale={locale}
                  onSave={(v) => save(row, v)}
                  saving={savingKey === row.key}
                  saved={savedKey === row.key}
                />
              ))}
            </ContentGroup>
          ))
        )}
      </div>
    </div>
  );
}

function ContentGroup({
  label,
  count,
  defaultOpen,
  children,
}: {
  label: string;
  count: number;
  defaultOpen: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <span className="flex items-center gap-2 text-base font-bold">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          {label}
        </span>
        <span className="rounded-full bg-paper-soft px-2 py-0.5 text-xs font-semibold text-ink-mute dark:bg-ink-mute dark:text-paper-mute">
          {count}
        </span>
      </button>
      {open && <div className="mt-3 space-y-2">{children}</div>}
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
