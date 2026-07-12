"use client";

import { useEffect, useState } from "react";
import { Loader2, Bike, Save, Trash2, Plus, Phone } from "lucide-react";

interface Courier {
  id: string;
  name: string;
  phone: string;
  login: string;
  active: boolean;
}
type Draft = { id?: string; name: string; phone: string; login: string; password: string; active: boolean };
const empty: Draft = { name: "", phone: "", login: "", password: "", active: true };

export function TabCouriers() {
  const [rows, setRows] = useState<Courier[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const j = await fetch("/api/admin/couriers").then((r) => r.json());
    setRows(j.ok ? j.couriers : []);
  }
  useEffect(() => {
    refresh();
  }, []);

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
          login: draft.login,
          password: draft.password || undefined,
          active: draft.active,
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

      {rows.map((c) => (
        <div key={c.id} className="card flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 font-bold">
              {c.name}
              {!c.active && <span className="rounded-full bg-paper-soft px-2 py-0.5 text-xs text-ink-mute dark:bg-ink-mute">выключен</span>}
            </div>
            <div className="mt-1 flex flex-wrap gap-3 text-xs text-ink-mute dark:text-paper-mute">
              <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{c.phone}</span>
              <span>логин: {c.login}</span>
            </div>
          </div>
          <div className="flex gap-2">
            {c.phone && (
              <a
                href={`https://wa.me/${c.phone.replace(/\D/g, "")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary !px-3 !py-2 text-sm text-emerald-600"
              >
                WhatsApp
              </a>
            )}
            <button
              className="btn-secondary !px-3 !py-2 text-sm"
              onClick={() => setDraft({ id: c.id, name: c.name, phone: c.phone, login: c.login, password: "", active: c.active })}
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
              <label className="label">Логин</label>
              <input className="input" value={draft.login} onChange={(e) => setDraft({ ...draft, login: e.target.value })} />
            </div>
            <div>
              <label className="label">Пароль {draft.id && <span className="text-ink-mute">(пусто = не менять)</span>}</label>
              <input className="input" type="text" value={draft.password} onChange={(e) => setDraft({ ...draft, password: e.target.value })} />
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
