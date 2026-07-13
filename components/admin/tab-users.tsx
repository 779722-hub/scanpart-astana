"use client";

import { useEffect, useState } from "react";
import { Loader2, UserPlus, Users as UsersIcon, KeyRound } from "lucide-react";

interface User {
  email: string;
  role: "owner" | "manager";
  createdAt: string;
  active: boolean;
}

export function TabUsers({ currentEmail }: { currentEmail: string }) {
  const [users, setUsers] = useState<User[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showPwdForm, setShowPwdForm] = useState(false);

  useEffect(() => {
    refresh();
  }, []);

  async function refresh() {
    const j = await fetch("/api/admin/users").then((r) => r.json());
    setUsers(j.ok ? (j.users as User[]) : []);
  }

  async function patch(email: string, body: object) {
    await fetch(`/api/admin/users/${encodeURIComponent(email)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    refresh();
  }

  if (!users) {
    return (
      <div className="card flex justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <UsersIcon className="h-5 w-5 text-brand" />
            <h2 className="text-lg font-bold">Пользователи</h2>
          </div>
          <div className="flex gap-2">
            <button
              className="btn-secondary !px-4 !py-2 text-sm"
              onClick={() => setShowPwdForm((s) => !s)}
            >
              <KeyRound className="h-4 w-4" /> Сменить мой пароль
            </button>
            <button
              className="btn-primary !px-4 !py-2 text-sm"
              onClick={() => setShowCreateForm((s) => !s)}
            >
              <UserPlus className="h-4 w-4" /> Добавить
            </button>
          </div>
        </div>

        {showPwdForm && (
          <ChangePasswordForm onDone={() => setShowPwdForm(false)} />
        )}
        {showCreateForm && (
          <CreateUserForm
            busy={creating}
            onSubmit={async (email, password, role) => {
              setCreating(true);
              const res = await fetch("/api/admin/users", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ email, password, role }),
              });
              const j = await res.json();
              setCreating(false);
              if (!res.ok || !j.ok) {
                alert(j.error === "user_exists" ? "Такой email уже есть" : `Ошибка: ${j.error}`);
                return;
              }
              setShowCreateForm(false);
              refresh();
            }}
          />
        )}
      </div>

      <div className="space-y-2">
        {users.length === 0 && (
          <div className="card text-center text-sm text-ink-mute dark:text-paper-mute">
            Пока нет пользователей. Создайте первого через /api/admin/auth/bootstrap.
          </div>
        )}
        {users.map((u) => (
          <article key={u.email} className="card">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-bold">{u.email}</div>
                <div className="text-xs text-ink-mute dark:text-paper-mute">
                  с {new Date(u.createdAt).toLocaleDateString("ru")}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  className="input !w-auto !py-2 text-sm"
                  value={u.role}
                  disabled={u.email === currentEmail}
                  onChange={(e) =>
                    patch(u.email, { role: e.target.value as "owner" | "manager" })
                  }
                >
                  <option value="manager">manager</option>
                  <option value="owner">owner</option>
                </select>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={u.active}
                    disabled={u.email === currentEmail}
                    onChange={(e) => patch(u.email, { active: e.target.checked })}
                    className="h-4 w-4 accent-brand"
                  />
                  активен
                </label>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function CreateUserForm({
  busy,
  onSubmit,
}: {
  busy: boolean;
  onSubmit: (email: string, password: string, role: "owner" | "manager") => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"owner" | "manager">("manager");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(email, password, role);
      }}
      className="mt-4 grid grid-cols-1 gap-3 rounded-2xl bg-paper-soft p-4 sm:grid-cols-[1fr_1fr_auto_auto] dark:bg-ink-mute"
    >
      <input
        className="input"
        type="email"
        placeholder="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <input
        className="input"
        type="text"
        placeholder="пароль (≥12 симв.)"
        required
        minLength={12}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <select
        className="input"
        value={role}
        onChange={(e) => setRole(e.target.value as "owner" | "manager")}
      >
        <option value="manager">manager</option>
        <option value="owner">owner</option>
      </select>
      <button className="btn-primary !px-4 !py-2 text-sm" disabled={busy}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Создать"}
      </button>
    </form>
  );
}

function ChangePasswordForm({ onDone }: { onDone: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/admin/users/me/password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) {
        alert(j.error === "wrong_current" ? "Неверный текущий пароль" : `Ошибка: ${j.error}`);
        return;
      }
      alert("Пароль обновлён");
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="mt-4 grid grid-cols-1 gap-3 rounded-2xl bg-paper-soft p-4 sm:grid-cols-[1fr_1fr_auto] dark:bg-ink-mute"
    >
      <input
        className="input"
        type="password"
        placeholder="текущий пароль"
        required
        autoComplete="current-password"
        value={current}
        onChange={(e) => setCurrent(e.target.value)}
      />
      <input
        className="input"
        type="password"
        placeholder="новый пароль (≥12 симв.)"
        required
        minLength={12}
        autoComplete="new-password"
        value={next}
        onChange={(e) => setNext(e.target.value)}
      />
      <button className="btn-primary !px-4 !py-2 text-sm" disabled={busy}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Сохранить"}
      </button>
    </form>
  );
}
