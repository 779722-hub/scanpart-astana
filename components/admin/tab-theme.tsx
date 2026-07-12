"use client";

import { useEffect, useState } from "react";
import { Loader2, Palette, Save, CheckCircle2 } from "lucide-react";

const FIELDS: {
  key: string;
  label: string;
  kind: "color" | "text" | "select" | "radius";
}[] = [
  { key: "brand_color", label: "Основной цвет (brand)", kind: "color" },
  { key: "brand_color_dark", label: "Основной для тёмной темы", kind: "color" },
  { key: "accent_color", label: "Акцент / контраст", kind: "color" },
  { key: "logo_text", label: "Текст логотипа", kind: "text" },
  { key: "default_theme", label: "Тема по умолчанию (light/dark/system)", kind: "select" },
  { key: "radius", label: "Скругление углов (px)", kind: "radius" },
];

function parseRadius(v: string | undefined): number {
  const n = Number.parseFloat(v ?? "");
  if (!Number.isFinite(n)) return 8;
  return Math.min(24, Math.max(0, Math.round(n)));
}

export function TabTheme() {
  const [map, setMap] = useState<Record<string, string> | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  useEffect(() => {
    fetch("/api/admin/theme")
      .then((r) => r.json())
      .then((j) => {
        if (!j.ok) {
          setMap({});
          return;
        }
        setMap(j.theme);
        setDraft(j.theme);
      })
      .catch(() => setMap({}));
  }, []);

  if (!map) {
    return (
      <div className="card flex justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  const dirty = Object.entries(draft).some(([k, v]) => map[k] !== v);

  async function save() {
    setStatus("saving");
    try {
      const patch: Record<string, string> = {};
      const current = map ?? {};
      for (const [k, v] of Object.entries(draft)) {
        if (current[k] !== v) patch[k] = v;
      }
      const res = await fetch("/api/admin/theme", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ patch }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) {
        alert(`Ошибка: ${j.error}`);
        setStatus("error");
        return;
      }
      setMap({ ...map, ...patch });
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 1500);
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="space-y-4">
      <div className="card space-y-4">
        <div className="flex items-center gap-2">
          <Palette className="h-5 w-5 text-brand" />
          <h2 className="text-lg font-bold">Цвета и оформление</h2>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {FIELDS.map((f) => (
            <div key={f.key}>
              <label className="label">{f.label}</label>
              {f.kind === "color" ? (
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={isHex(draft[f.key]) ? draft[f.key] : "#E10600"}
                    onChange={(e) =>
                      setDraft({ ...draft, [f.key]: e.target.value.toUpperCase() })
                    }
                    className="h-10 w-14 cursor-pointer rounded-lg border border-paper-mute dark:border-ink-mute"
                  />
                  <input
                    className="input flex-1 font-mono uppercase"
                    value={draft[f.key] ?? ""}
                    onChange={(e) =>
                      setDraft({ ...draft, [f.key]: e.target.value.toUpperCase() })
                    }
                    placeholder="#RRGGBB"
                    pattern="^#[0-9A-Fa-f]{6}$"
                  />
                </div>
              ) : f.kind === "select" ? (
                <select
                  className="input"
                  value={draft[f.key] ?? "system"}
                  onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                >
                  <option value="light">light (день)</option>
                  <option value="dark">dark (ночь)</option>
                  <option value="system">system (авто)</option>
                </select>
              ) : f.kind === "radius" ? (
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={0}
                    max={24}
                    step={1}
                    value={parseRadius(draft[f.key])}
                    onChange={(e) =>
                      setDraft({ ...draft, [f.key]: e.target.value })
                    }
                    className="flex-1 accent-brand"
                  />
                  <span className="w-10 text-sm font-semibold tabular-nums">
                    {parseRadius(draft[f.key])}px
                  </span>
                  <span
                    className="h-10 w-14 flex-none border-2 border-brand bg-brand/10"
                    style={{ borderRadius: `${parseRadius(draft[f.key])}px` }}
                    aria-hidden
                  />
                </div>
              ) : (
                <input
                  className="input"
                  value={draft[f.key] ?? ""}
                  onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <button
          onClick={save}
          disabled={!dirty || status === "saving"}
          className="btn-primary"
        >
          {status === "saving" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : status === "saved" ? (
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
      <p className="text-xs text-ink-mute dark:text-paper-mute">
        После сохранения нажмите «Опубликовать» наверху, чтобы применить изменения на сайте.
      </p>
    </div>
  );
}

function isHex(v: string | undefined): v is string {
  return Boolean(v && /^#[0-9A-Fa-f]{6}$/.test(v));
}
