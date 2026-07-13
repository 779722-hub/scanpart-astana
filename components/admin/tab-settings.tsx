"use client";

import { useEffect, useState } from "react";
import { Loader2, Save, CheckCircle2, Settings, Send, Radar } from "lucide-react";
import { MARKUP_MAX, MARKUP_MIN } from "@/lib/markup";

const ANALOGS_MIN = 0;
const ANALOGS_MAX = 10;

const FIELDS: { key: string; label: string; hint?: string; kind?: "number" | "text" | "color" }[] = [
  { key: "markup_percent", label: "Наценка, %", hint: `${MARKUP_MIN}–${MARKUP_MAX}`, kind: "number" },
  { key: "analogs_max", label: "Сколько аналогов показывать", hint: `${ANALOGS_MIN}–${ANALOGS_MAX}`, kind: "number" },
  { key: "express_delivery_price", label: "Стоимость экспресс-доставки, ₸", kind: "number" },
  { key: "express_hours", label: "Часы работы экспресс-доставки" },
  { key: "pickup_address", label: "Адрес самовывоза / офиса (куда курьер везёт самовывоз)" },
  { key: "pickup_hours", label: "Часы самовывоза" },
  { key: "office_lat", label: "Офис: широта (для метки на карте)", hint: "скопируйте из 2ГИС, напр. 51.1605" },
  { key: "office_lng", label: "Офис: долгота", hint: "напр. 71.4704" },
  { key: "office_color", label: "Цвет офиса на карте", kind: "color" },
  { key: "manager_phone_display", label: "Телефон менеджера (как показывать)" },
  { key: "manager_whatsapp_e164", label: "WhatsApp менеджера (E.164 без +, напр. 77000000000)" },
  { key: "telegram_bot_token", label: "Токен Telegram-бота (от @BotFather; можно вместо Vercel env)" },
  { key: "telegram_chat_id", label: "Telegram chat ID для уведомлений (можно определить кнопкой ниже)" },
];

export function TabSettings() {
  const [map, setMap] = useState<Record<string, string> | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [tgBusy, setTgBusy] = useState<"" | "detect" | "test">("");
  const [tgMsg, setTgMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [geoBusy, setGeoBusy] = useState(false);

  async function geocodeOffice() {
    const addr = (draft.pickup_address ?? "").trim();
    if (!addr) {
      alert("Сначала впишите «Адрес самовывоза / офиса».");
      return;
    }
    setGeoBusy(true);
    try {
      const j = await fetch(`/api/admin/geocode?q=${encodeURIComponent(addr)}`).then((r) => r.json());
      if (j.ok) {
        setDraft((d) => ({ ...d, office_lat: String(j.lat), office_lng: String(j.lng) }));
      } else {
        alert(
          j.error === "not_found"
            ? "Адрес не найден — уточните его или впишите координаты вручную из 2ГИС."
            : "Геокодер недоступен, впишите координаты вручную."
        );
      }
    } finally {
      setGeoBusy(false);
    }
  }

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

  async function tgAction(action: "detect" | "test") {
    setTgBusy(action);
    setTgMsg(null);
    try {
      const j = await fetch("/api/admin/telegram", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      }).then((r) => r.json());
      if (action === "detect") {
        if (j.chatId) {
          setDraft((d) => ({ ...d, telegram_chat_id: j.chatId }));
          setMap((m) => ({ ...(m ?? {}), telegram_chat_id: j.chatId }));
          setTgMsg({ ok: true, text: `Определён chat: ${j.chatId}${j.title ? ` (${j.title})` : ""} — сохранён.` });
        } else {
          setTgMsg({
            ok: false,
            text:
              j.error === "no_token"
                ? "Сначала сохраните токен бота."
                : j.error === "bad_token"
                  ? "Токен неверный. Скопируйте его целиком из @BotFather (вид: 123456789:AA...), без пробелов, и сохраните заново."
                  : j.error === "no_messages"
                    ? "Напишите боту любое сообщение (или добавьте его в группу), затем повторите."
                    : `Не удалось: ${j.error}`,
          });
        }
      } else {
        setTgMsg(
          j.ok
            ? { ok: true, text: "Тестовое сообщение отправлено в Telegram." }
            : {
                ok: false,
                text:
                  j.error === "no_token"
                    ? "Сначала сохраните токен бота."
                    : j.error === "no_chat"
                      ? "Сначала определите chat ID (кнопка слева)."
                      : /not found|unauthorized/i.test(j.error ?? "")
                        ? "Токен неверный — проверьте, что скопировали его целиком."
                        : /chat not found/i.test(j.error ?? "")
                          ? "Чат не найден — определите chat ID заново (напишите боту)."
                          : `Ошибка: ${j.error}`,
              }
        );
      }
    } finally {
      setTgBusy("");
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
              {f.kind === "color" ? (
                <input
                  type="color"
                  className="h-10 w-16 cursor-pointer rounded-lg border border-paper-mute bg-transparent dark:border-ink-mute"
                  value={draft[f.key] || "#16A34A"}
                  onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                />
              ) : (
                <input
                  className="input"
                  type={f.kind === "number" ? "number" : "text"}
                  value={draft[f.key] ?? ""}
                  onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                />
              )}
              {f.hint && (
                <p className="mt-1 text-xs text-ink-mute dark:text-paper-mute">{f.hint}</p>
              )}
            </div>
          ))}
        </div>
        <button
          type="button"
          className="btn-secondary !px-3 !py-2 text-sm"
          onClick={geocodeOffice}
          disabled={geoBusy}
        >
          {geoBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Radar className="h-4 w-4" />}
          Определить координаты офиса по адресу
        </button>
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

      {/* Telegram connection */}
      <div className="card space-y-3">
        <div className="flex items-center gap-2">
          <Send className="h-5 w-5 text-brand" />
          <h2 className="text-lg font-bold">Telegram-уведомления</h2>
        </div>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-ink-mute dark:text-paper-mute">
          <li>Вставьте токен бота (от @BotFather) в поле выше и нажмите «Сохранить».</li>
          <li>Откройте вашего бота в Telegram и напишите ему любое сообщение (для группы — добавьте бота в группу).</li>
          <li>Нажмите «Определить chat ID», затем «Отправить тест».</li>
        </ol>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary !px-4 !py-2 text-sm" onClick={() => tgAction("detect")} disabled={tgBusy !== ""}>
            {tgBusy === "detect" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Radar className="h-4 w-4" />}
            Определить chat ID
          </button>
          <button className="btn-primary !px-4 !py-2 text-sm" onClick={() => tgAction("test")} disabled={tgBusy !== ""}>
            {tgBusy === "test" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Отправить тест
          </button>
        </div>
        {tgMsg && (
          <div className={`rounded-2xl px-4 py-3 text-sm ${tgMsg.ok ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-200" : "bg-brand/10 text-brand"}`}>
            {tgMsg.text}
          </div>
        )}
      </div>
    </div>
  );
}
