"use client";

import { useEffect, useState } from "react";
import { Loader2, Bike, Save, Trash2, Plus, Phone } from "lucide-react";

interface Courier {
  id: string;
  name: string;
  phone: string;
  whatsapp?: string;
  login: string;
  active: boolean;
  ratePerTrip?: number;
}
interface DeliveryLite { courierId: string; status: string; deliveredAt: string }
type Draft = { id?: string; name: string; phone: string; whatsapp: string; login: string; password: string; active: boolean; ratePerTrip: string };
const empty: Draft = { name: "", phone: "", whatsapp: "", login: "", password: "", active: true, ratePerTrip: "" };
const fmt = (n: number) => new Intl.NumberFormat("ru-RU").format(n);

export function TabCouriers() {
  const [rows, setRows] = useState<Courier[] | null>(null);
  const [deliveries, setDeliveries] = useState<DeliveryLite[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const [c, d] = await Promise.all([
      fetch("/api/admin/couriers").then((r) => r.json()),
      fetch("/api/admin/deliveries").then((r) => r.json()).catch(() => ({ ok: false })),
    ]);
    setRows(c.ok ? c.couriers : []);
    setDeliveries(d.ok ? (d.deliveries as DeliveryLite[]) : []);
  }
  useEffect(() => {
    refresh();
  }, []);

  // Аналитика рейсов: рейс = выполненная (доставленная) доставка. Считаем
  // всего / сегодня / за месяц и сумму к оплате по ставке курьера.
  function stats(courierId: string) {
    const startDay = new Date(); startDay.setHours(0, 0, 0, 0);
    const startMonth = new Date(); startMonth.setDate(1); startMonth.setHours(0, 0, 0, 0);
    const done = deliveries.filter((d) => d.courierId === courierId && d.status === "delivered");
    const since = (from: Date) => done.filter((d) => d.deliveredAt && new Date(d.deliveredAt) >= from).length;
    return { all: done.length, today: since(startDay), month: since(startMonth) };
  }

  async function save() {
    if (!draft) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/couriers", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: draft.id,
          name: draft.name,
          phone: draft.phone,
          whatsapp: draft.whatsapp || undefined,
          login: draft.login,
          password: draft.password || undefined,
          active: draft.active,
          ratePerTrip: draft.ratePerTrip.trim() === "" ? 0 : Math.max(0, Number(draft.ratePerTrip.replace(",", ".")) || 0),
        }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) {
        alert(j.error === "password_required" ? "Задайте пароль для нового курьера" : `Ошибка: ${j.error}`);
        return;
      }
      setDraft(null);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  // Drop a test position near central Astana so the courier shows on the map
  // right away (spread by index so several don't overlap).
  async function testLocation(id: string, index: number) {
    const lat = 51.13 + ((index % 3) - 1) * 0.012;
    const lng = 71.43 + (Math.floor(index / 3) - 1) * 0.016;
    const res = await fetch("/api/admin/couriers/location", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ courierId: id, lat, lng }),
    });
    const j = await res.json().catch(() => ({}));
    alert(j.ok ? "Тестовая точка поставлена — курьер появится на карте во вкладке «Доставки»." : "Не удалось поставить точку.");
  }

  async function remove(id: string) {
    if (!confirm("Удалить курьера?")) return;
    await fetch("/api/admin/couriers", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    });
    refresh();
  }

  if (!rows) {
    return (
      <div className="card flex justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="card flex items-center gap-2 text-base font-bold">
        <Bike className="h-5 w-5 text-brand" /> Курьеры
      </div>

      {rows.map((c, i) => (
        <div key={c.id} className="card flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 font-bold">
              {c.name}
              {!c.active && <span className="rounded-full bg-paper-soft px-2 py-0.5 text-xs text-ink-mute dark:bg-ink-mute dark:text-paper-mute">выключен</span>}
            </div>
            <div className="mt-1 flex flex-wrap gap-3 text-xs text-ink-mute dark:text-paper-mute">
              <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{c.phone}</span>
              <span>логин: {c.login}</span>
            </div>
            {/* Аналитика рейсов и заработок */}
            {(() => {
              const s = stats(c.id);
              const rate = c.ratePerTrip ?? 0;
              return (
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  <span className="rounded-lg bg-paper-soft px-2 py-1 font-semibold dark:bg-ink-mute">
                    Рейсов: {s.all}
                  </span>
                  <span className="text-ink-mute dark:text-paper-mute">сегодня {s.today} · за месяц {s.month}</span>
                  <span className="text-ink-mute dark:text-paper-mute">
                    ставка {rate > 0 ? `${fmt(rate)} ₸/рейс` : "не задана"}
                  </span>
                  {rate > 0 && (
                    <span className="rounded-lg bg-emerald-100 px-2 py-1 font-bold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200">
                      к оплате: {fmt(s.all * rate)} ₸
                    </span>
                  )}
                </div>
              );
            })()}
          </div>
          <div className="flex gap-2">
            {(c.whatsapp || c.phone) && (
              <a
                href={`https://wa.me/${(c.whatsapp || c.phone).replace(/\D/g, "")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary !px-3 !py-2 text-sm text-emerald-600"
              >
                WhatsApp
              </a>
            )}
            <button
              className="btn-secondary !px-3 !py-2 text-sm"
              onClick={() => testLocation(c.id, i)}
              title="Поставить тестовую точку на карте"
            >
              На карту (тест)
            </button>
            <button
              className="btn-secondary !px-3 !py-2 text-sm"
              onClick={() => setDraft({ id: c.id, name: c.name, phone: c.phone, whatsapp: c.whatsapp ?? "", login: c.login, password: "", active: c.active, ratePerTrip: c.ratePerTrip ? String(c.ratePerTrip) : "" })}
            >
              Изменить
            </button>
            <button className="btn-secondary !px-3 !py-2 text-sm text-brand" onClick={() => remove(c.id)} title="Удалить">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}

      {draft ? (
        <div className="card space-y-3">
          <div className="text-base font-bold">{draft.id ? "Изменить курьера" : "Новый курьер"}</div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Имя</label>
              <input className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </div>
            <div>
              <label className="label">Телефон</label>
              <input className="input" inputMode="tel" placeholder="+77051112233" value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />
            </div>
            <div>
              <label className="label">WhatsApp <span className="text-ink-mute dark:text-paper-mute">(пусто = как телефон)</span></label>
              <input className="input" inputMode="tel" placeholder="+77051112233" value={draft.whatsapp} onChange={(e) => setDraft({ ...draft, whatsapp: e.target.value })} />
            </div>
            <div>
              <label className="label">Логин</label>
              <input className="input" value={draft.login} onChange={(e) => setDraft({ ...draft, login: e.target.value })} />
            </div>
            <div>
              <label className="label">Пароль {draft.id && <span className="text-ink-mute dark:text-paper-mute">(пусто = не менять)</span>}</label>
              <input className="input" type="text" value={draft.password} onChange={(e) => setDraft({ ...draft, password: e.target.value })} />
            </div>
            <div>
              <label className="label">Ставка за рейс, ₸ <span className="text-ink-mute dark:text-paper-mute">(для расчёта оплаты)</span></label>
              <input className="input" inputMode="numeric" placeholder="напр. 1500" value={draft.ratePerTrip} onChange={(e) => setDraft({ ...draft, ratePerTrip: e.target.value })} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />
            Активен
          </label>
          <div className="flex justify-end gap-2">
            <button className="btn-secondary !px-4 !py-2 text-sm" onClick={() => setDraft(null)}>Отмена</button>
            <button className="btn-primary !px-4 !py-2 text-sm" onClick={save} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Сохранить
            </button>
          </div>
        </div>
      ) : (
        <button className="btn-secondary" onClick={() => setDraft({ ...empty })}>
          <Plus className="h-4 w-4" /> Добавить курьера
        </button>
      )}
    </div>
  );
}
