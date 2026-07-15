"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Loader2,
  LogIn,
  UserPlus,
  LogOut,
  Car,
  Package,
  Trash2,
  RefreshCw,
  Search,
  Pencil,
  Check,
  X,
  Plus,
  SunMoon,
} from "lucide-react";
import { useCart } from "@/lib/cart";
import { ThemeSwitcher } from "@/components/theme-switcher";

function AppearanceCard() {
  return (
    <section className="card flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <SunMoon className="h-5 w-5 text-brand" />
        <span className="font-semibold">Тема сайта</span>
      </div>
      <ThemeSwitcher />
    </section>
  );
}

const fmt = (n: number) => new Intl.NumberFormat("ru-RU").format(n);

interface OrderRow {
  rowNumber: number;
  date: string;
  partName: string;
  partArticle: string;
  brand: string;
  price: number;
  quantity: number;
  orderType: string;
  status: string;
}

interface MeData {
  email: string;
  name: string;
  phone: string;
  whatsapp?: string;
  vins: string[];
}

export function AccountView({ locale }: { locale: string }) {
  const router = useRouter();
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "guest" }
    | { kind: "auth"; me: MeData; orders: OrderRow[] }
  >({ kind: "loading" });

  async function refresh() {
    const res = await fetch("/api/customer/me");
    if (res.status === 401) {
      setState({ kind: "guest" });
      return;
    }
    const j = await res.json();
    if (j.ok) setState({ kind: "auth", me: j.customer, orders: j.orders });
    else setState({ kind: "guest" });
  }

  useEffect(() => {
    refresh();
  }, []);

  if (state.kind === "loading") {
    return (
      <div className="card flex justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (state.kind === "guest") {
    // Refresh the server layout too, so the header (Войти → Кабинет) and the
    // vehicle bar reflect the new session without a full reload.
    return (
      <GuestView
        locale={locale}
        onSignedIn={() => {
          router.refresh();
          refresh();
        }}
      />
    );
  }

  return (
    <Dashboard locale={locale} me={state.me} orders={state.orders} onChange={refresh} />
  );
}

function GuestView({
  locale,
  onSignedIn,
}: {
  locale: string;
  onSignedIn: () => void;
}) {
  const [tab, setTab] = useState<"login" | "register">("login");
  return (
    <div className="space-y-4">
      <div role="tablist" className="inline-flex rounded-2xl border border-paper-mute p-1 dark:border-ink-mute">
        <button
          role="tab"
          aria-selected={tab === "login"}
          onClick={() => setTab("login")}
          className={`rounded-xl px-4 py-2 text-sm font-semibold ${
            tab === "login"
              ? "bg-brand text-white"
              : "text-ink-mute hover:bg-paper dark:text-paper-mute dark:hover:bg-ink"
          }`}
        >
          Войти
        </button>
        <button
          role="tab"
          aria-selected={tab === "register"}
          onClick={() => setTab("register")}
          className={`rounded-xl px-4 py-2 text-sm font-semibold ${
            tab === "register"
              ? "bg-brand text-white"
              : "text-ink-mute hover:bg-paper dark:text-paper-mute dark:hover:bg-ink"
          }`}
        >
          Регистрация
        </button>
      </div>
      {tab === "login" ? (
        <LoginForm onDone={onSignedIn} />
      ) : (
        <RegisterForm onDone={onSignedIn} />
      )}
      <p className="px-2 text-xs text-ink-mute dark:text-paper-mute">
        Личный кабинет: сохраним VIN ваших авто и историю заказов, чтобы вы могли
        повторить покупку в один клик.
      </p>
      <AppearanceCard />
      <Link href={`/${locale}`} className="text-sm underline text-ink-mute dark:text-paper-mute">
        ← На главную
      </Link>
    </div>
  );
}

function LoginForm({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/customer/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) {
        setErr(
          j.error === "rate_limited"
            ? `Слишком много попыток, через ${j.retryAfter} с`
            : "Неверный email или пароль"
        );
        return;
      }
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card space-y-4">
      <h1 className="text-2xl font-bold">Вход</h1>
      <div>
        <label className="label">Email / Логин</label>
        <input
          className="input"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>
      <div>
        <label className="label">Пароль</label>
        <input
          className="input"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </div>
      {err && (
        <div className="rounded-2xl bg-brand/10 px-4 py-3 text-sm text-brand">
          {err}
        </div>
      )}
      <button className="btn-primary w-full" disabled={busy}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
        Войти
      </button>
    </form>
  );
}

function RegisterForm({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState({
    email: "",
    password: "",
    name: "",
    phone: "",
    whatsapp: "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/customer/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) {
        setErr(
          j.error === "email_taken"
            ? "Аккаунт с таким email уже существует"
            : j.error === "rate_limited"
              ? `Слишком много попыток, через ${j.retryAfter} с`
              : "Проверьте поля и попробуйте ещё раз"
        );
        return;
      }
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card space-y-4">
      <h1 className="text-2xl font-bold">Регистрация</h1>
      <div>
        <label className="label">Email / Логин</label>
        <input
          className="input"
          type="email"
          autoComplete="username"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          required
        />
      </div>
      <div>
        <label className="label">Пароль (≥ 8 символов)</label>
        <input
          className="input"
          type="password"
          autoComplete="new-password"
          minLength={8}
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          required
        />
      </div>
      <div>
        <label className="label">Имя</label>
        <input
          className="input"
          autoComplete="name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          required
        />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Телефон</label>
          <input
            className="input"
            inputMode="tel"
            placeholder="+77051112233"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            required
          />
        </div>
        <div>
          <label className="label">WhatsApp (желательно)</label>
          <input
            className="input"
            inputMode="tel"
            placeholder="+77051112233"
            value={form.whatsapp}
            onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
          />
        </div>
      </div>
      {err && (
        <div className="rounded-2xl bg-brand/10 px-4 py-3 text-sm text-brand">
          {err}
        </div>
      )}
      <button className="btn-primary w-full" disabled={busy}>
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <UserPlus className="h-4 w-4" />
        )}
        Создать аккаунт
      </button>
    </form>
  );
}

function Dashboard({
  locale,
  me,
  orders,
  onChange,
}: {
  locale: string;
  me: MeData;
  orders: OrderRow[];
  onChange: () => void;
}) {
  const router = useRouter();
  const cart = useCart();

  async function logout() {
    await fetch("/api/customer/auth/logout", { method: "POST" });
    onChange();
    router.refresh();
  }

  async function deleteVin(vin: string) {
    if (!confirm(`Убрать VIN ${vin} из сохранённых?`)) return;
    await fetch("/api/customer/vins", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ vin }),
    });
    onChange();
  }

  async function addVin(vin: string): Promise<boolean> {
    const res = await fetch("/api/customer/vins", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ vin: vin.trim().toUpperCase() }),
    });
    if (!res.ok) {
      alert("VIN должен быть 17 символов (без I, O, Q).");
      return false;
    }
    onChange();
    return true;
  }

  async function editVin(oldVin: string, newVin: string): Promise<boolean> {
    const next = newVin.trim().toUpperCase();
    if (!next || next === oldVin) return true;
    const res = await fetch("/api/customer/vins", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ oldVin, newVin: next }),
    });
    if (!res.ok) {
      alert("VIN должен быть 17 символов (без I, O, Q).");
      return false;
    }
    onChange();
    return true;
  }

  // Group orders by date+parts so each "submission" appears as one block.
  const grouped = groupOrders(orders);

  return (
    <div className="space-y-4">
      <header className="card flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Здравствуйте, {me.name}
          </h1>
          <p className="mt-1 text-sm text-ink-mute dark:text-paper-mute">
            {me.email} · {me.phone}
          </p>
        </div>
        <button onClick={logout} className="btn-secondary !px-4 !py-2 text-sm">
          <LogOut className="h-4 w-4" /> Выйти
        </button>
      </header>

      {/* VINs */}
      <section className="card space-y-3">
        <div className="flex items-center gap-2">
          <Car className="h-5 w-5 text-brand" />
          <h2 className="text-lg font-bold">Мои авто (VIN)</h2>
        </div>
        {me.vins.length === 0 ? (
          <p className="text-sm text-ink-mute dark:text-paper-mute">
            Когда вы введёте VIN в поиске, мы сохраним его сюда. Или добавьте
            вручную ниже.
          </p>
        ) : (
          <ul className="space-y-2">
            {me.vins.map((vin) => (
              <VinRow
                key={vin}
                vin={vin}
                locale={locale}
                onDelete={() => deleteVin(vin)}
                onEdit={(next) => editVin(vin, next)}
              />
            ))}
          </ul>
        )}
        <AddVinForm onAdd={addVin} />
      </section>

      {/* Orders history */}
      <section className="card space-y-3">
        <div className="flex items-center gap-2">
          <Package className="h-5 w-5 text-brand" />
          <h2 className="text-lg font-bold">История заказов</h2>
        </div>
        {grouped.length === 0 ? (
          <p className="text-sm text-ink-mute dark:text-paper-mute">
            Пока заказов нет.
          </p>
        ) : (
          <ul className="space-y-3">
            {grouped.map((g) => (
              <li
                key={g.key}
                className="rounded-2xl border border-paper-mute p-3 dark:border-ink-mute"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-xs text-ink-mute dark:text-paper-mute">
                      {new Date(g.date).toLocaleString("ru")} · {g.orderType}
                    </div>
                    <div className="text-sm font-semibold">{g.status}</div>
                  </div>
                  <RepeatButton
                    items={g.items}
                    onLoaded={() => router.push(`/${locale}/cart`)}
                    cart={cart}
                  />
                </div>
                <ul className="mt-2 space-y-1 text-sm">
                  {g.items.map((it, idx) => (
                    <li key={idx} className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 flex-1 truncate">
                        {it.partName} <span className="text-ink-mute dark:text-paper-mute">· {it.brand} {it.partArticle}</span>
                      </span>
                      <span className="flex-none whitespace-nowrap text-ink-mute dark:text-paper-mute">
                        {fmt(it.price)} ₸ × {it.quantity}
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="mt-2 text-right text-sm">
                  Сумма: <strong>{fmt(g.total)} ₸</strong>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Тема сайта — перенесена сюда из шапки */}
      <AppearanceCard />
    </div>
  );
}

interface OrderGroup {
  key: string;
  date: string;
  orderType: string;
  status: string;
  total: number;
  items: OrderRow[];
}

function groupOrders(rows: OrderRow[]): OrderGroup[] {
  const groups = new Map<string, OrderGroup>();
  for (const r of rows) {
    // Round timestamp to the minute → all parts submitted together share a key.
    const minute = r.date.slice(0, 16);
    const k = `${minute}|${r.orderType}`;
    const g = groups.get(k);
    if (g) {
      g.items.push(r);
      g.total += r.price * r.quantity;
    } else {
      groups.set(k, {
        key: k,
        date: r.date,
        orderType: r.orderType,
        status: r.status,
        total: r.price * r.quantity,
        items: [r],
      });
    }
  }
  return [...groups.values()].sort(
    (a, b) => +new Date(b.date) - +new Date(a.date)
  );
}

function RepeatButton({
  items,
  onLoaded,
  cart,
}: {
  items: OrderRow[];
  onLoaded: () => void;
  cart: ReturnType<typeof useCart>;
}) {
  const [busy, setBusy] = useState(false);
  async function repeat() {
    setBusy(true);
    try {
      const res = await fetch("/api/customer/reorder", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          items: items.map((it) => ({
            article: it.partArticle,
            brand: it.brand,
            partName: it.partName,
            quantity: it.quantity,
          })),
        }),
      });
      const j = await res.json();
      if (!j.ok) {
        alert("Не удалось получить актуальные цены, попробуйте позже.");
        return;
      }
      const found = (j.items as Array<{
        brand: string;
        article: string;
        name: string;
        price: number;
        availableQty: number;
        found: boolean;
      }>).filter((i) => i.found);
      const missing = j.items.length - found.length;
      if (!found.length) {
        alert("Ни одна из позиций не доступна сейчас в Астане.");
        return;
      }
      cart.clear();
      found.forEach((i, idx) => {
        cart.add({
          id: `${i.brand}|${i.article}|reorder${idx}`,
          brand: i.brand,
          article: i.article,
          name: i.name,
          price: i.price,
          quantity: Math.min(items[idx]?.quantity ?? 1, i.availableQty),
          availableQty: i.availableQty,
        });
      });
      if (missing > 0) {
        alert(
          `Из ${j.items.length} позиций ${missing} сейчас нет в Астане — добавлены только доступные (${found.length}).`
        );
      }
      onLoaded();
    } finally {
      setBusy(false);
    }
  }
  return (
    <button onClick={repeat} disabled={busy} className="btn-primary !px-3 !py-2 text-xs">
      {busy ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <RefreshCw className="h-3 w-3" />
      )}
      Повторить заказ
    </button>
  );
}

function VinRow({
  vin,
  locale,
  onDelete,
  onEdit,
}: {
  vin: string;
  locale: string;
  onDelete: () => void;
  onEdit: (next: string) => Promise<boolean>;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(vin);
  const [busy, setBusy] = useState(false);
  const [vehicle, setVehicle] = useState<{ make: string; model: string; year: string } | null>(null);
  const [searching, setSearching] = useState(false);

  // Resolve a human label ("NISSAN FX35/45") for the saved VIN. Full decode
  // (Shate-M catalog) is needed for the model — NHTSA often lacks it. Manual
  // entries have no decodable VIN.
  useEffect(() => {
    if (vin.startsWith("MANUAL")) return;
    let cancelled = false;
    fetch(`/api/vin?vin=${encodeURIComponent(vin)}`)
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled && j.ok) setVehicle(j.vehicle);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [vin]);

  // Open search for this car. The VIN page auto-resolves it and shows BOTH
  // search types (part-number + name) with the vehicle set — no re-entry.
  function search() {
    setSearching(true);
    router.push(`/${locale}/search/vin?vin=${encodeURIComponent(vin)}`);
  }

  const label = vehicle
    ? [vehicle.make, vehicle.model].filter((s) => s && s !== "—").join(" ")
    : "";

  if (editing) {
    return (
      <li className="flex items-center justify-between gap-2 rounded-2xl bg-paper-soft p-3 dark:bg-ink-mute">
        <input
          className="input !py-2 font-mono text-sm uppercase"
          value={draft}
          onChange={(e) => setDraft(e.target.value.toUpperCase())}
          maxLength={17}
          autoFocus
        />
        <div className="flex flex-none gap-1">
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const ok = await onEdit(draft);
              setBusy(false);
              if (ok) setEditing(false);
            }}
            className="rounded-xl p-2 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
            aria-label="Сохранить"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          </button>
          <button
            onClick={() => {
              setDraft(vin);
              setEditing(false);
            }}
            className="rounded-xl p-2 text-ink-mute dark:text-paper-mute hover:bg-paper dark:hover:bg-ink"
            aria-label="Отмена"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </li>
    );
  }

  return (
    <li className="space-y-2 rounded-2xl bg-paper-soft p-3 dark:bg-ink-mute">
      <div className="flex items-center gap-2">
        <Car className="h-4 w-4 flex-none text-brand" />
        <span className="font-bold">
          {label || (vin.startsWith("MANUAL") ? "Автомобиль" : "Определяем модель…")}
        </span>
        {vehicle?.year && vehicle.year !== "—" && (
          <span className="text-sm text-ink-mute dark:text-paper-mute">{vehicle.year}</span>
        )}
      </div>
      <code className="block select-all break-all font-mono text-xs text-ink-mute dark:text-paper-mute">
        {vin}
      </code>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={search}
          disabled={searching}
          className="btn-primary flex-1 !px-3 !py-2 text-sm"
        >
          {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Поиск запчастей
        </button>
        <button
          onClick={() => setEditing(true)}
          className="inline-flex items-center justify-center gap-1.5 rounded-2xl border border-paper-mute bg-white px-3 py-2 text-sm font-semibold text-ink transition hover:border-ink-mute dark:border-ink dark:bg-ink-soft dark:text-paper"
        >
          <Pencil className="h-4 w-4" />
          Изменить
        </button>
        <button
          onClick={onDelete}
          className="inline-flex items-center justify-center gap-1.5 rounded-2xl border-2 border-brand/40 bg-brand/5 px-3 py-2 text-sm font-semibold text-brand transition hover:border-brand hover:bg-brand/10"
        >
          <Trash2 className="h-4 w-4" />
          Удалить
        </button>
      </div>
    </li>
  );
}

function AddVinForm({ onAdd }: { onAdd: (vin: string) => Promise<boolean> }) {
  const [open, setOpen] = useState(false);
  const [vin, setVin] = useState("");
  const [busy, setBusy] = useState(false);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="btn-secondary !px-4 !py-2 text-sm"
      >
        <Plus className="h-4 w-4" /> Добавить VIN
      </button>
    );
  }

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!vin.trim()) return;
        setBusy(true);
        const ok = await onAdd(vin);
        setBusy(false);
        if (ok) {
          setVin("");
          setOpen(false);
        }
      }}
      className="flex flex-wrap items-center gap-2 rounded-2xl border border-paper-mute p-3 dark:border-ink-mute"
    >
      <input
        className="input flex-1 min-w-[12rem] font-mono uppercase tracking-[0.15em]"
        placeholder="JN8AS05Y37X012345"
        value={vin}
        onChange={(e) => setVin(e.target.value.toUpperCase())}
        maxLength={17}
        autoFocus
        required
      />
      <button className="btn-primary !px-4 !py-2 text-sm" disabled={busy || !vin.trim()}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
        Сохранить
      </button>
      <button
        type="button"
        onClick={() => {
          setVin("");
          setOpen(false);
        }}
        className="btn-secondary !px-3 !py-2 text-sm"
      >
        Отмена
      </button>
    </form>
  );
}
