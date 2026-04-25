"use client";

import { useEffect, useState } from "react";
import { Loader2, Save, CheckCircle2, Settings } from "lucide-react";
import { MARKUP_MAX, MARKUP_MIN } from "@/lib/markup";

const ANALOGS_MIN = 0;
const ANALOGS_MAX = 10;

const FIELDS: { key: string; label: string; hint?: string; kind?: "number" | "text" }[] = [
  { key: "markup_percent", label: "Наценка, %", hint: `${MARKUP_MIN}–${MARKUP_MAX}`, kind: "number" },
  { key: "analogs_max", label: "Сколько аналогов показывать", hint: `${ANALOGS_MIN}–${ANALOGS_MAX}`, kind: "number" },
  { key: "express_delivery_price", label: "Стоимость экспресс-доставки, ₸", kind: "number" },
  { key: "express_hours", label: "Часы работы экспресс-доставки" },
  { key: "pickup_address", label: "Адрес самовывоза" },
  { key: "pickup_hours", label: "Часы самовывоза" },
  { key: "manager_phone_display", label: "Телефон менеджера (как показывать)" },
  { key: "manager_whatsapp_e164", label: "WhatsApp менеджера (E.164 без +, напр. 77000000000)" },
  { key: "telegram_chat_id", label: "Telegram chat ID для уведомлений" },
];

export function TabSettings() {
  const [map, setMap] = useState<Record<string, string> | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then((j) => {
        if (!j.ok) {
          setMap({});
          return;
        }
        setMap(j.settings);
        setDraft(j.settings);
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

  const dirty = FIELDS.some((f) => (map[f.key] ?? "") !== (draft[f.key] ?? ""));

  async function save() {
    setStatus("saving");
    try {
      const patch: Record<string, string> = {};
      for (const f of FIELDS) {
        if ((map?.[f.key] ?? "") !== (draft[f.key] ?? "")) {
          patch[f.key] = draft[f.key] ?? "";
        }
      }
      if (
        patch.markup_percent &&
        (Number(patch.markup_percent) < MARKUP_MIN ||
          Number(patch.markup_percent) > MARKUP_MAX)
      ) {
        alert(`Наценка должна быть в диапазоне ${MARKUP_MIN}–${MARKUP_MAX}%`);
        setStatus("idle");
        return;
      }
      if (
        patch.analogs_max &&
        (Number(patch.analogs_max) < ANALOGS_MIN ||
          Number(patch.analogs_max) > ANALOGS_MAX)
      ) {
        alert(`Количество аналогов должно быть в диапазоне ${ANALOGS_MIN}–${ANALOGS_MAX}`);
        setStatus("idle");
        return;
      }
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ patch }),
      });
      if (!res.ok) throw new Error();
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
          <Settings className="h-5 w-5 text-brand" />
          <h2 className="text-lg font-bold">Бизнес-настройки</h2>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {FIELDS.map((f) => (
            <div key={f.key} className={f.kind === "text" || !f.kind ? "sm:col-span-2" : ""}>
              <label className="label">{f.label}</label>
              <input
                className="input"
                type={f.kind === "number" ? "number" : "text"}
                value={draft[f.key] ?? ""}
                onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
              />
              {f.hint && (
                <p className="mt-1 text-xs text-ink-mute dark:text-paper-mute">{f.hint}</p>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="flex justify-end">
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
    </div>
  );
}
