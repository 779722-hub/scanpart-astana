"use client";

import { useEffect, useState } from "react";
import { Loader2, Save, CheckCircle2, Settings, Send, Radar, Camera, KeyRound, Mic, Tag, RefreshCw, Layers, Plus, Trash2 } from "lucide-react";
import { MARKUP_MAX, MARKUP_MIN, PRICE_BRACKETS_MAX } from "@/lib/markup";

const ANALOGS_MIN = 0;
const ANALOGS_MAX = 30;

// Одна строка таблицы диапазонов наценки (строковые поля для полей ввода).
type BracketRow = { from: string; to: string; kind: "percent" | "fixed"; value: string };

function parseBracketRows(json?: string): BracketRow[] {
  if (!json || !json.trim()) return [];
  try {
    const arr = JSON.parse(json);
    if (!Array.isArray(arr)) return [];
    return arr.map((b) => ({
      from: b?.from != null ? String(b.from) : "",
      to: b?.to != null ? String(b.to) : "",
      kind: b?.kind === "fixed" ? "fixed" : "percent",
      value: b?.value != null ? String(b.value) : "",
    }));
  } catch {
    return [];
  }
}

// Сериализация в JSON для настройки price_brackets. Пустое «До» = null («и выше»).
// Строки без числового «От» или «Значение» отбрасываются.
function serializeBracketRows(rows: BracketRow[]): string {
  const arr = rows
    .map((r) => ({
      from: Number(r.from),
      to: r.to.trim() === "" ? null : Number(r.to),
      kind: r.kind,
      value: Number(r.value),
    }))
    .filter((b) => Number.isFinite(b.from) && Number.isFinite(b.value));
  return JSON.stringify(arr);
}

const YESNO_OPTIONS = [
  { v: "on", l: "Да" },
  { v: "off", l: "Нет" },
];

const SECRET_PLACEHOLDER = "задано, введите новое чтобы заменить";

const FIELDS: {
  key: string;
  label: string;
  hint?: string;
  kind?: "number" | "text" | "select" | "textarea";
  options?: { v: string; l: string }[];
  def?: string;
  secret?: boolean;
}[] = [
  { key: "markup_percent", label: "Наценка, %", hint: `${MARKUP_MIN}–${MARKUP_MAX}`, kind: "number" },
  { key: "analogs_max", label: "Сколько аналогов показывать", hint: `${ANALOGS_MIN}–${ANALOGS_MAX}`, kind: "number" },
  { key: "show_oem", label: "Показывать OEM-номер оригинала в результатах", kind: "select", options: YESNO_OPTIONS, def: "on" },
  { key: "show_photos", label: "Показывать фото деталей в результатах", kind: "select", options: YESNO_OPTIONS, def: "off" },
  { key: "search_loading_label", label: "Надпись, пока грузятся все склады (над результатами)", hint: "по умолч. «Подождите загрузку всех позиций»" },
  { key: "search_ready_label", label: "Надпись, когда позиции со всех складов загружены", hint: "по умолч. «Данные запчасти на складе в Астане»" },
  { key: "interkom_enabled", label: "Поставщик Interkom (склад И6, Астана)", hint: "Логин/пароль задаются в переменных окружения. Включайте после проверки.", kind: "select", options: YESNO_OPTIONS, def: "off" },
  {
    key: "tecdoc_api_key",
    label: "Ключ TecDoc/RapidAPI для авто-фото (опционально)",
    hint: "Пока пусто — фото берутся только из ручной загрузки. С ключом добавятся авто-фото по бренду+артикулу.",
  },
  { key: "photo_size_phaeton", label: "Размер фото Phaeton при открытии, px", hint: "по умолч. 1000", kind: "number" },
  { key: "photo_size_autotrade", label: "Размер фото Autotrade при открытии, px", hint: "по умолч. 800", kind: "number" },
  { key: "photo_size_shatem", label: "Размер фото Shate-M при открытии, px", hint: "по умолч. 400 (низкое разрешение — мельче, чтобы не мылилось)", kind: "number" },
  { key: "sale_enabled", label: "Раздел «Распродажа» (скидочные товары Астаны)", kind: "select", options: YESNO_OPTIONS, def: "off" },
  { key: "sale_markup_percent", label: "Наценка для распродажи, %", hint: "пусто = как общая наценка", kind: "number" },
  {
    key: "footer_links",
    label: "Ссылки в подвале — колонка «Информация»",
    hint: "По одной на строку: «Название | ссылка». Напр. «Доставка курьерам | /ru/courier» или «Instagram | https://instagram.com/…». Пусто — колонка не показывается.",
    kind: "textarea",
  },
  { key: "express_delivery_price", label: "Стоимость экспресс-доставки, ₸", kind: "number" },
  { key: "express_hours", label: "Часы работы экспресс-доставки" },
  { key: "pickup_address", label: "Адрес самовывоза / офиса (куда курьер везёт самовывоз)" },
  { key: "pickup_hours", label: "Часы самовывоза" },
  { key: "office_lat", label: "Офис: широта (для метки на карте)", hint: "скопируйте из 2ГИС, напр. 51.1605" },
  { key: "office_lng", label: "Офис: долгота", hint: "напр. 71.4704" },
  { key: "manager_phone_display", label: "Телефон менеджера (как показывать)" },
  { key: "manager_whatsapp_e164", label: "WhatsApp менеджера (E.164 без +, напр. 77000000000)" },
  { key: "telegram_bot_token", label: "Токен Telegram-бота (от @BotFather; можно вместо Vercel env)", secret: true },
  { key: "telegram_chat_id", label: "Telegram chat ID для уведомлений (можно определить кнопкой ниже)" },
  {
    key: "google_site_verification",
    label: "Google Search Console: код подтверждения",
    hint: "Только значение content из мета-тега, без кавычек и HTML",
  },
  {
    key: "yandex_verification",
    label: "Яндекс.Вебмастер: код подтверждения",
    hint: "Только значение content из мета-тега, без кавычек и HTML",
  },
];

// Keys for the VIN-OCR (техпаспорт по фото) card — saved together with FIELDS.
const AI_KEYS = [
  "vin_ocr_provider",
  "gemini_api_key",
  "openai_api_key",
  "openrouter_api_key",
  "openrouter_model",
  "voice_search_enabled",
  "voice_stt_provider",
];

export function TabSettings() {
  const [map, setMap] = useState<Record<string, string> | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [brackets, setBrackets] = useState<BracketRow[]>([]);
  const [secretsSet, setSecretsSet] = useState<Record<string, boolean>>({});
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [tgBusy, setTgBusy] = useState<"" | "detect" | "test">("");
  const [tgMsg, setTgMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [geoBusy, setGeoBusy] = useState(false);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrMsg, setOcrMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [saleBusy, setSaleBusy] = useState(false);
  const [saleMsg, setSaleMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function testOcrKeys() {
    setOcrBusy(true);
    setOcrMsg(null);
    try {
      const j = await fetch("/api/admin/vin-ocr-test", { method: "POST" }).then((r) => r.json());
      if (!j.ok) {
        setOcrMsg({ ok: false, text: "Не удалось выполнить проверку." });
        return;
      }
      const line = (name: string, s: { configured: boolean; ok: boolean }) =>
        !s.configured ? `${name}: ключ не задан` : s.ok ? `${name}: работает ✓` : `${name}: ключ неверный ✗`;
      setOcrMsg({
        ok: Boolean(j.gemini?.ok || j.openai?.ok || j.openrouter?.ok),
        text: `${line("Gemini", j.gemini)} · ${line("OpenAI", j.openai)} · ${line("OpenRouter", j.openrouter)}`,
      });
    } catch {
      setOcrMsg({ ok: false, text: "Ошибка проверки — попробуйте ещё раз." });
    } finally {
      setOcrBusy(false);
    }
  }

  async function refreshSale() {
    setSaleBusy(true);
    setSaleMsg(null);
    try {
      const r = await fetch("/api/cron/sale-sync");
      const j = await r.json();
      if (r.ok && j.ok) {
        setSaleMsg({
          ok: true,
          text: `Добавлено со страниц ${j.from}–${j.from + 39}: ${j.scraped} записей. ${
            j.next === 1 ? "Цикл завершён — дальше начнётся заново." : `Дальше со стр. ${j.next}.`
          }`,
        });
      } else {
        setSaleMsg({ ok: false, text: `Ошибка: ${j.error ?? r.status}` });
      }
    } catch {
      setSaleMsg({ ok: false, text: "Сеть недоступна" });
    } finally {
      setSaleBusy(false);
    }
  }

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
        setBrackets(parseBracketRows(j.settings.price_brackets));
        setSecretsSet(j.secretsSet ?? {});
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

  // Диапазоны наценки — сериализованный JSON. Обе стороны нормализуем через
  // parse→serialize, чтобы разница в форматировании не считалась изменением.
  const bracketsJson = serializeBracketRows(brackets);
  const savedBracketsJson = serializeBracketRows(parseBracketRows(map.price_brackets));
  const bracketsDirty = bracketsJson !== savedBracketsJson;

  const dirty =
    FIELDS.some((f) => (map[f.key] ?? "") !== (draft[f.key] ?? "")) ||
    AI_KEYS.some((k) => (map[k] ?? "") !== (draft[k] ?? "")) ||
    bracketsDirty;

  // Проверка диапазонов: по возрастанию, без пересечений; «и выше» только в
  // последней строке. Возвращает индексы проблемных строк (для подсветки).
  const bracketIssues = new Set<number>();
  {
    let prevTo: number | null = 0;
    let openSeen = false;
    for (let i = 0; i < brackets.length; i++) {
      const r = brackets[i];
      const from = Number(r.from);
      const to = r.to.trim() === "" ? null : Number(r.to);
      if (r.from.trim() === "" || !Number.isFinite(from) || r.value.trim() === "" || !Number.isFinite(Number(r.value))) {
        bracketIssues.add(i);
        continue;
      }
      if (openSeen) bracketIssues.add(i); // строки после «и выше» недостижимы
      if (prevTo !== null && from < prevTo) bracketIssues.add(i); // пересечение/не по возрастанию
      if (to !== null && to <= from) bracketIssues.add(i); // «До» должно быть больше «От»
      if (to === null) openSeen = true;
      prevTo = to;
    }
  }
  const hasBracketIssues = bracketIssues.size > 0;

  // Secret fields come back blanked from the server; show a "set" hint until the
  // admin types a replacement (only a typed value is sent on save).
  const secretPh = (key: string, fallback = "") =>
    secretsSet[key] && !draft[key] ? SECRET_PLACEHOLDER : fallback;

  async function save() {
    setStatus("saving");
    try {
      const patch: Record<string, string> = {};
      for (const f of FIELDS) {
        if ((map?.[f.key] ?? "") !== (draft[f.key] ?? "")) {
          patch[f.key] = draft[f.key] ?? "";
        }
      }
      for (const k of AI_KEYS) {
        if ((map?.[k] ?? "") !== (draft[k] ?? "")) {
          patch[k] = draft[k] ?? "";
        }
      }
      if (bracketsDirty) {
        patch.price_brackets = bracketsJson;
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
            <div key={f.key} className={f.kind === "text" || f.kind === "textarea" || !f.kind ? "sm:col-span-2" : ""}>
              <label className="label">{f.label}</label>
              {f.kind === "select" ? (
                <select
                  className="input"
                  value={draft[f.key] ?? f.def ?? ""}
                  onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                >
                  {f.options?.map((o) => (
                    <option key={o.v} value={o.v}>{o.l}</option>
                  ))}
                </select>
              ) : f.kind === "textarea" ? (
                <textarea
                  className="input min-h-[120px] font-mono text-sm"
                  value={draft[f.key] ?? ""}
                  onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                />
              ) : (
                <input
                  className="input"
                  type={f.kind === "number" ? "number" : f.secret ? "password" : "text"}
                  autoComplete={f.secret ? "off" : undefined}
                  placeholder={f.secret ? secretPh(f.key) : undefined}
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

      {/* Наценка по диапазонам входящей цены */}
      <div className="card space-y-3">
        <div className="flex items-center gap-2">
          <Layers className="h-5 w-5 text-brand" />
          <h2 className="text-lg font-bold">Наценка по диапазонам цены</h2>
        </div>
        <p className="text-sm text-ink-mute dark:text-paper-mute">
          Наценка зависит от входящей цены поставщика. Диапазоны — основной способ;
          если цена не попала ни в один диапазон, применяется общая «Наценка, %»
          из настроек выше. «От» — включительно, «До» — не включая. Оставьте «До»
          пустым в последней строке — это значит «и выше».
        </p>
        {brackets.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-ink-mute dark:text-paper-mute">
                  <th className="pb-1 pr-2 font-medium">От (₸)</th>
                  <th className="pb-1 pr-2 font-medium">До (₸)</th>
                  <th className="pb-1 pr-2 font-medium">Тип</th>
                  <th className="pb-1 pr-2 font-medium">Значение</th>
                  <th className="pb-1" />
                </tr>
              </thead>
              <tbody>
                {brackets.map((r, i) => (
                  <tr key={i} className={bracketIssues.has(i) ? "bg-brand/5" : ""}>
                    <td className="py-1 pr-2">
                      <input
                        className="input"
                        type="number"
                        value={r.from}
                        onChange={(e) =>
                          setBrackets(brackets.map((b, j) => (j === i ? { ...b, from: e.target.value } : b)))
                        }
                      />
                    </td>
                    <td className="py-1 pr-2">
                      <input
                        className="input"
                        type="number"
                        placeholder="и выше"
                        value={r.to}
                        onChange={(e) =>
                          setBrackets(brackets.map((b, j) => (j === i ? { ...b, to: e.target.value } : b)))
                        }
                      />
                    </td>
                    <td className="py-1 pr-2">
                      <select
                        className="input"
                        value={r.kind}
                        onChange={(e) =>
                          setBrackets(
                            brackets.map((b, j) =>
                              j === i ? { ...b, kind: e.target.value as "percent" | "fixed" } : b
                            )
                          )
                        }
                      >
                        <option value="percent">%</option>
                        <option value="fixed">₸</option>
                      </select>
                    </td>
                    <td className="py-1 pr-2">
                      <input
                        className="input"
                        type="number"
                        value={r.value}
                        onChange={(e) =>
                          setBrackets(brackets.map((b, j) => (j === i ? { ...b, value: e.target.value } : b)))
                        }
                      />
                    </td>
                    <td className="py-1">
                      <button
                        type="button"
                        className="btn-secondary !px-2 !py-2"
                        onClick={() => setBrackets(brackets.filter((_, j) => j !== i))}
                        aria-label="Удалить диапазон"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {hasBracketIssues && (
          <p className="rounded-2xl bg-brand/10 px-4 py-3 text-sm text-brand">
            Проверьте диапазоны: значения должны идти по возрастанию и не
            пересекаться, «До» — больше «От», пустое «До» («и выше») — только в
            последней строке.
          </p>
        )}
        <button
          type="button"
          className="btn-secondary !px-3 !py-2 text-sm"
          onClick={() => setBrackets([...brackets, { from: "", to: "", kind: "percent", value: "" }])}
          disabled={brackets.length >= PRICE_BRACKETS_MAX}
        >
          <Plus className="h-4 w-4" />
          Добавить диапазон
        </button>
      </div>

      {/* Распродажа — обновление накопленного списка */}
      <div className="card space-y-3">
        <div className="flex items-center gap-2">
          <Tag className="h-5 w-5 text-brand" />
          <h2 className="text-lg font-bold">Распродажа</h2>
        </div>
        <p className="text-sm text-ink-mute dark:text-paper-mute">
          Список распродажи собирается из Phaeton по частям (~40 страниц за раз) и
          копится автоматически раз в сутки. Кнопка ниже добавляет следующую порцию
          сразу — нажимайте несколько раз, чтобы быстро набрать полный список. Включение
          раздела и наценка — в настройках выше.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="btn-secondary !px-3 !py-2 text-sm"
            onClick={refreshSale}
            disabled={saleBusy}
          >
            {saleBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Обновить распродажу (+порция)
          </button>
          {saleMsg && (
            <span className={`text-sm ${saleMsg.ok ? "text-emerald-600 dark:text-emerald-400" : "text-brand"}`}>
              {saleMsg.text}
            </span>
          )}
        </div>
      </div>

      {/* VIN-OCR — распознавание техпаспорта по фото */}
      <div className="card space-y-4">
        <div className="flex items-center gap-2">
          <Camera className="h-5 w-5 text-brand" />
          <h2 className="text-lg font-bold">Распознавание техпаспорта (VIN по фото)</h2>
        </div>
        <p className="text-sm text-ink-mute dark:text-paper-mute">
          Клиент фотографирует техпаспорт — ИИ определяет VIN и сам подставляет его
          в поиск, дальше подбирается марка и запчасти. Ключ хранится здесь и клиенту
          не виден. После сохранения кнопка появляется на сайте в течение минуты.
        </p>
        <div>
          <label className="label">ИИ для распознавания</label>
          <select
            className="input"
            value={draft.vin_ocr_provider ?? ""}
            onChange={(e) => setDraft({ ...draft, vin_ocr_provider: e.target.value })}
          >
            <option value="">Выключено</option>
            <option value="gemini">Google Gemini (дешевле, рекомендуется)</option>
            <option value="openai">OpenAI GPT</option>
            <option value="openrouter">OpenRouter (резерв, медленнее)</option>
          </select>
        </div>
        <div>
          <label className="label">Ключ Google Gemini (AI Studio, вид «AIza…»)</label>
          <input
            className="input"
            type="password"
            value={draft.gemini_api_key ?? ""}
            onChange={(e) => setDraft({ ...draft, gemini_api_key: e.target.value })}
            placeholder={secretPh("gemini_api_key", "AIza…")}
            autoComplete="off"
          />
          <p className="mt-1 text-xs text-ink-mute dark:text-paper-mute">
            Бесплатный ключ: aistudio.google.com → «Get API key».
          </p>
        </div>
        <div>
          <label className="label">Ключ OpenAI (вид «sk-…»)</label>
          <input
            className="input"
            type="password"
            value={draft.openai_api_key ?? ""}
            onChange={(e) => setDraft({ ...draft, openai_api_key: e.target.value })}
            placeholder={secretPh("openai_api_key", "sk-…")}
            autoComplete="off"
          />
          <p className="mt-1 text-xs text-ink-mute dark:text-paper-mute">
            Ключ: platform.openai.com → API keys.
          </p>
        </div>
        <div>
          <label className="label">Ключ OpenRouter (вид «sk-or-…»)</label>
          <input
            className="input"
            type="password"
            value={draft.openrouter_api_key ?? ""}
            onChange={(e) => setDraft({ ...draft, openrouter_api_key: e.target.value })}
            placeholder={secretPh("openrouter_api_key", "sk-or-…")}
            autoComplete="off"
          />
          <p className="mt-1 text-xs text-ink-mute dark:text-paper-mute">
            Резервный шлюз (медленнее). Ключ: openrouter.ai → Keys.
          </p>
        </div>
        <div>
          <label className="label">Модель OpenRouter (необязательно)</label>
          <input
            className="input"
            value={draft.openrouter_model ?? ""}
            onChange={(e) => setDraft({ ...draft, openrouter_model: e.target.value })}
            placeholder="google/gemini-2.0-flash-exp:free"
            autoComplete="off"
          />
          <p className="mt-1 text-xs text-ink-mute dark:text-paper-mute">
            По умолчанию «google/gemini-2.0-flash-exp:free». Нужна модель с
            поддержкой изображений (vision).
          </p>
        </div>
        <p className="rounded-2xl bg-paper-soft px-4 py-3 text-xs text-ink-mute dark:bg-ink-mute dark:text-paper-mute">
          Надёжность: если основной ИИ не ответит или вернёт ошибку — система
          автоматически переключается на следующий по цепочке
          (Gemini → OpenAI → OpenRouter). Задайте несколько ключей, чтобы резерв
          работал.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn-secondary !px-4 !py-2 text-sm"
            onClick={testOcrKeys}
            disabled={ocrBusy || dirty}
            title={dirty ? "Сначала сохраните изменения" : undefined}
          >
            {ocrBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
            Проверить ключи
          </button>
          {dirty && (
            <span className="text-xs text-ink-mute dark:text-paper-mute">
              Сохраните изменения перед проверкой.
            </span>
          )}
        </div>
        {ocrMsg && (
          <div
            className={`rounded-2xl px-4 py-3 text-sm ${
              ocrMsg.ok
                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-200"
                : "bg-brand/10 text-brand"
            }`}
          >
            {ocrMsg.text}
          </div>
        )}
      </div>

      {/* Голосовой поиск (микрофон в поиске по названию) */}
      <div className="card space-y-4">
        <div className="flex items-center gap-2">
          <Mic className="h-5 w-5 text-brand" />
          <h2 className="text-lg font-bold">Голосовой поиск (микрофон в поиске по названию)</h2>
        </div>
        <p className="text-sm text-ink-mute dark:text-paper-mute">
          Клиент нажимает микрофон и говорит название запчасти. Основной способ —
          бесплатное распознавание прямо в браузере (Chrome/Android). Где браузер
          не поддерживает (iPhone Safari, Firefox) — используется резерв через ИИ.
        </p>
        <div>
          <label className="label">Голосовой поиск</label>
          <select
            className="input"
            value={draft.voice_search_enabled ?? ""}
            onChange={(e) => setDraft({ ...draft, voice_search_enabled: e.target.value })}
          >
            <option value="">Выключено</option>
            <option value="on">Включено</option>
          </select>
        </div>
        <div>
          <label className="label">Резервный ИИ (когда браузер не поддерживает)</label>
          <select
            className="input"
            value={draft.voice_stt_provider ?? ""}
            onChange={(e) => setDraft({ ...draft, voice_stt_provider: e.target.value })}
          >
            <option value="">Только браузер (бесплатно)</option>
            <option value="openai">OpenAI Whisper (надёжнее для iPhone)</option>
            <option value="gemini">Google Gemini</option>
          </select>
          <p className="mt-1 text-xs text-ink-mute dark:text-paper-mute">
            Резерв использует ключи Gemini/OpenAI из блока выше — отдельный ключ не
            нужен. При сбое одного ИИ система пробует второй автоматически.
          </p>
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
              <CheckCircle2 className="h-4 w-4" /> Сохранено и опубликовано
            </>
          ) : (
            <>
              <Save className="h-4 w-4" /> Сохранить и опубликовать
            </>
          )}
        </button>
      </div>
      <p className="text-xs text-ink-mute dark:text-paper-mute">
        Изменения публикуются сразу при сохранении — отдельная кнопка не нужна.
      </p>

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
