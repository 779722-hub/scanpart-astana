"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DeliveryMap } from "@/components/admin/delivery-map";

interface Courier {
  id: string;
  name: string;
  phone: string;
}
type DeliveryStatus =
  | "assigned"
  | "picking"
  | "en_route"
  | "delivered"
  | "canceled";
interface Delivery {
  id: string;
  customerName: string;
  phone: string;
  whatsapp: string;
  address: string;
  lat: number | null;
  lng: number | null;
  items: string;
  warehouseIds: string[];
  status: DeliveryStatus;
  waLink?: string;
}
interface RouteStop {
  kind: "pickup" | "dropoff";
  refId: string;
  label: string;
  lat: number;
  lng: number;
  legKm: number;
  etaMinutes: number;
}
interface RoutePlan {
  stops: RouteStop[];
  totalKm: number;
  totalMinutes: number;
  skipped: string[];
}

const STATUS_RU: Record<DeliveryStatus, string> = {
  assigned: "Назначена",
  picking: "Забираю со склада",
  en_route: "В пути к клиенту",
  delivered: "Вручена",
  canceled: "Отменена",
};

function etaClock(min: number): string {
  const d = new Date(Date.now() + min * 60000);
  return `${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes()
  ).padStart(2, "0")}`;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const json = (await res.json().catch(() => ({}))) as T & {
    ok?: boolean;
    error?: string;
  };
  if (!res.ok || json.ok === false) {
    throw new Error(json.error || `HTTP ${res.status}`);
  }
  return json;
}

function getCoords(): Promise<{ lat: number; lng: number } | undefined> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve(undefined);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(undefined),
      { timeout: 8000, maximumAge: 60000 }
    );
  });
}

export default function CourierPage() {
  const [courier, setCourier] = useState<Courier | null>(null);
  const [checking, setChecking] = useState(true);

  // Login form
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [loginErr, setLoginErr] = useState("");

  // Route view
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [route, setRoute] = useState<RoutePlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [geo, setGeo] = useState<{ status: "idle" | "ok" | "denied" | "error"; at: string }>({ status: "idle", at: "" });

  const nowHm = () => new Date().toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" });

  // Post the current position immediately (on load, on each action, manually).
  const sendLocation = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeo({ status: "error", at: "" });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        apiFetch("/api/courier/location", {
          method: "POST",
          body: JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        })
          .then(() => setGeo({ status: "ok", at: nowHm() }))
          .catch(() => setGeo({ status: "error", at: "" }));
      },
      (err) => setGeo({ status: err.code === 1 ? "denied" : "error", at: "" }),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 10000 }
    );
  }, []);

  // Auth gate.
  useEffect(() => {
    (async () => {
      try {
        const r = await apiFetch<{ courier: Courier }>("/api/courier/me");
        setCourier(r.courier);
      } catch {
        setCourier(null);
      } finally {
        setChecking(false);
      }
    })();
  }, []);

  const loadRoute = useCallback(async () => {
    setLoading(true);
    sendLocation(); // report position on every load / action
    try {
      const loc = await getCoords();
      const qs = loc ? `?lat=${loc.lat}&lng=${loc.lng}` : "";
      const r = await apiFetch<{ deliveries: Delivery[]; route: RoutePlan }>(
        `/api/courier/route${qs}`
      );
      setDeliveries(r.deliveries);
      setRoute(r.route);
    } catch (e) {
      alert(`Ошибка: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, [sendLocation]);

  // Load the route once we have a courier.
  useEffect(() => {
    if (courier) loadRoute();
  }, [courier, loadRoute]);

  // Stream the courier's position to the backend (throttled to ~30s) while the
  // route view is open, so the manager sees them live.
  useEffect(() => {
    if (!courier) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    let last = 0;
    let watchId: number | null = null;
    try {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const now = Date.now();
          if (now - last < 30000) return;
          last = now;
          apiFetch("/api/courier/location", {
            method: "POST",
            body: JSON.stringify({
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
            }),
          })
            .then(() => setGeo({ status: "ok", at: nowHm() }))
            .catch(() => {});
        },
        (err) => setGeo((g) => (g.status === "ok" ? g : { status: err.code === 1 ? "denied" : "error", at: "" })),
        { enableHighAccuracy: true, maximumAge: 30000 }
      );
    } catch {
      /* geolocation denied — ignore */
    }
    return () => {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    };
  }, [courier]);

  async function submitLogin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setLoginErr("");
    try {
      const r = await apiFetch<{ courier: Courier }>("/api/courier/auth/login", {
        method: "POST",
        body: JSON.stringify({ login: login.trim(), password }),
      });
      setCourier(r.courier);
    } catch {
      setLoginErr("Неверный логин или пароль");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    try {
      await apiFetch("/api/courier/auth/logout", { method: "POST" });
    } catch {
      /* ignore */
    }
    setCourier(null);
    setDeliveries([]);
    setRoute(null);
    setCodes({});
  }

  async function act(
    d: Delivery,
    action: "start" | "enroute" | "deliver"
  ) {
    try {
      const res = await apiFetch<{
        status: string;
        codeSent?: boolean;
        waLink?: string;
      }>(`/api/courier/deliveries/${d.id}`, {
        method: "PATCH",
        body: JSON.stringify({ action, code: codes[d.id] }),
      });
      if (action === "enroute" && res.codeSent) {
        alert("Код получения отправлен клиенту в WhatsApp.");
      } else if (action === "enroute") {
        alert("Код готов. Нажмите зелёную кнопку «Отправить код клиенту в WhatsApp».");
      }
      await loadRoute();
    } catch (e) {
      const msg = (e as Error).message;
      alert(msg === "bad_code" ? "Неверный код от клиента" : `Ошибка: ${msg}`);
    }
  }

  if (checking) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md items-center justify-center p-4 text-ink-mute dark:text-paper-mute">
        Загрузка…
      </main>
    );
  }

  // Login form
  if (!courier) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-4">
        <div className="text-center">
          <h1 className="text-2xl font-extrabold">SCANPART · Курьер</h1>
          <p className="mt-1 text-ink-mute dark:text-paper-mute">
            Вход для курьеров
          </p>
        </div>
        <form onSubmit={submitLogin} className="card space-y-3">
          <div>
            <label className="label">Логин</label>
            <input
              className="input"
              autoCapitalize="none"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Пароль</label>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {loginErr && <p className="text-sm text-brand">{loginErr}</p>}
          <button
            type="submit"
            className="btn-primary w-full"
            disabled={busy || !login || !password}
          >
            {busy ? "Вход…" : "Войти"}
          </button>
        </form>
      </main>
    );
  }

  const mapDrops = route
    ? route.stops
        .filter((s) => s.kind === "dropoff" && s.lat && s.lng)
        .map((s) => ({ id: s.refId, name: s.label, lat: s.lat, lng: s.lng }))
    : [];

  // Route view
  return (
    <main className="mx-auto max-w-md p-4">
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-base font-bold">Курьер: {courier.name}</h1>
        <button className="text-brand" onClick={logout}>
          Выйти
        </button>
      </div>

      {/* Geolocation status — so the courier knows the manager can see them. */}
      <div
        className={`mb-3 flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-xs ${
          geo.status === "ok"
            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-200"
            : geo.status === "denied" || geo.status === "error"
              ? "bg-brand/10 text-brand"
              : "bg-paper-soft text-ink-mute dark:bg-ink-mute dark:text-paper-mute"
        }`}
      >
        <span>
          {geo.status === "ok"
            ? `📍 Вы на карте · отправлено ${geo.at}`
            : geo.status === "denied"
              ? "⚠ Геолокация запрещена — разрешите доступ к местоположению для этого сайта, иначе вас не видно на карте."
              : geo.status === "error"
                ? "⚠ Не удалось определить позицию. Включите геолокацию и нажмите «обновить»."
                : "Определяю геопозицию…"}
        </span>
        <button className="flex-none font-semibold underline" onClick={sendLocation}>
          обновить
        </button>
      </div>

      <button
        className="btn-secondary mb-4 w-full"
        onClick={loadRoute}
        disabled={loading}
      >
        {loading ? "Обновление…" : "Обновить"}
      </button>

      {route && route.stops.length > 0 && (
        <div className="card mb-4">
          <div className="mb-2 font-extrabold">
            Маршрут ({route.totalKm} км · {route.totalMinutes} мин)
          </div>
          <div className="space-y-2">
            {route.stops.map((st, i) => (
              <div key={i} className="flex items-center gap-2">
                <span
                  className={`chip ${
                    st.kind === "pickup"
                      ? "bg-amber-100 text-amber-800"
                      : "bg-brand/10 text-brand"
                  }`}
                >
                  {st.kind === "pickup" ? "Склад" : "Клиент"}
                </span>
                <span className="flex-1 truncate">{st.label}</span>
                <span className="text-ink-mute dark:text-paper-mute">
                  ~{etaClock(st.etaMinutes)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {mapDrops.length > 0 && (
        <DeliveryMap
          couriers={[]}
          warehouses={[]}
          drops={mapDrops}
          className="mb-4 h-64 w-full overflow-hidden rounded-2xl"
        />
      )}

      {loading && deliveries.length === 0 && (
        <p className="mt-10 text-center text-ink-mute dark:text-paper-mute">
          Загрузка…
        </p>
      )}
      {!loading && deliveries.length === 0 && (
        <p className="mt-10 text-center text-ink-mute dark:text-paper-mute">
          Назначенных доставок нет.
        </p>
      )}

      <div className="space-y-4">
        {deliveries.map((d) => (
          <div key={d.id} className="card">
            <div className="text-xs font-bold text-brand">
              {STATUS_RU[d.status]}
            </div>
            <div className="text-lg font-extrabold">{d.customerName}</div>
            <div className="text-base">{d.items}</div>
            <div className="text-ink-mute dark:text-paper-mute">{d.address}</div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {d.phone && (
                <a
                  href={`tel:${d.phone}`}
                  className="btn-secondary !px-4 !py-2 text-sm"
                >
                  Позвонить
                </a>
              )}

              {d.status === "assigned" && (
                <button
                  className="btn-primary grow !px-4 !py-2 text-sm"
                  onClick={() => act(d, "start")}
                >
                  Забрать со склада
                </button>
              )}
              {d.status === "picking" && (
                <button
                  className="btn-primary grow !px-4 !py-2 text-sm"
                  onClick={() => act(d, "enroute")}
                >
                  В путь к клиенту
                </button>
              )}
              {d.status === "en_route" && (
                <div className="flex w-full flex-col gap-2">
                  {d.waLink && (
                    <a
                      href={d.waLink}
                      target="_blank"
                      rel="noreferrer"
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-bold text-white transition hover:bg-emerald-600"
                    >
                      📲 Отправить код клиенту в WhatsApp
                    </a>
                  )}
                  <input
                    className="input text-center tracking-[0.4em]"
                    inputMode="numeric"
                    maxLength={4}
                    placeholder="Код от клиента (4 цифры)"
                    value={codes[d.id] ?? ""}
                    onChange={(e) =>
                      setCodes((c) => ({
                        ...c,
                        [d.id]: e.target.value.replace(/\D/g, ""),
                      }))
                    }
                  />
                  <button
                    className="btn-primary w-full !py-2 text-sm"
                    onClick={() => act(d, "deliver")}
                  >
                    Подтвердить выдачу
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
