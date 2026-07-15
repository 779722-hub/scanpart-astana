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
  seq?: number;
  locked?: boolean;
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
  geometry?: [number, number][] | null;
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
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

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
  const [myPos, setMyPos] = useState<{ lat: number; lng: number } | null>(null);

  const nowHm = () => new Date().toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" });

  // Post the current position immediately (on load, on each action, manually).
  const sendLocation = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeo({ status: "error", at: "" });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setMyPos({ lat: pos.coords.latitude, lng: pos.coords.longitude });
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
    fetch("/api/public/logo")
      .then((r) => r.json())
      .then((j) => {
        if (j.ok) setLogoUrl(j.url);
      })
      .catch(() => {});
  }, []);

  const brand = (
    <div className="flex items-center justify-center gap-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {logoUrl ? <img src={logoUrl} alt="SCANPART" className="h-8 w-auto" /> : null}
      <span className="text-xl font-extrabold tracking-tight">
        <span className="text-brand">SCANPART</span> · Доставка
      </span>
    </div>
  );

  const loadRoute = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
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
        if (!silent) alert(`Ошибка: ${(e as Error).message}`);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [sendLocation]
  );

  // Load the route once we have a courier, then keep it fresh (so deliveries
  // deleted/reassigned by the manager disappear on their own).
  useEffect(() => {
    if (!courier) return;
    loadRoute();
    const t = setInterval(() => loadRoute(true), 25000);
    return () => clearInterval(t);
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
          setMyPos({ lat: pos.coords.latitude, lng: pos.coords.longitude });
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
      alert(
        msg === "bad_code"
          ? "Неверный код от клиента"
          : msg === "finish_current_first"
            ? "Сначала завершите текущую доставку — заказы выполняются по очереди."
            : `Ошибка: ${msg}`
      );
    }
  }

  // Open a driving route from the courier's position to the delivery in 2GIS.
  const navLink = (d: Delivery) => {
    if (d.lat && d.lng) {
      return myPos
        ? `https://2gis.kz/directions/points/${myPos.lng},${myPos.lat};${d.lng},${d.lat}`
        : `https://2gis.kz/geo/${d.lng},${d.lat}`;
    }
    return `https://2gis.kz/search/${encodeURIComponent(d.address || "Астана")}`;
  };

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
          {brand}
          <p className="mt-2 text-ink-mute dark:text-paper-mute">
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

  const stopsWithGeo = route ? route.stops.filter((s) => s.lat && s.lng) : [];
  const mapPickups = stopsWithGeo
    .filter((s) => s.kind === "pickup")
    .map((s) => ({ id: s.refId, name: s.label, lat: s.lat, lng: s.lng }));
  const mapDrops = stopsWithGeo
    .filter((s) => s.kind === "dropoff")
    .map((s) => ({ id: s.refId, name: s.label, lat: s.lat, lng: s.lng }));
  const mapMe = myPos ? [{ id: "me", name: "Вы", lat: myPos.lat, lng: myPos.lng, stale: false }] : [];
  const nextStop = route && route.stops.length > 0 ? route.stops[0] : null;
  const showMap = mapMe.length + mapPickups.length + mapDrops.length > 0;

  // Route view
  return (
    <main className="mx-auto max-w-md p-4">
      <div className="mb-3 flex items-center justify-between border-b border-paper-mute pb-3 dark:border-ink-mute">
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {logoUrl ? <img src={logoUrl} alt="SCANPART" className="h-7 w-auto" /> : null}
          <span className="font-extrabold">
            <span className="text-brand">SCANPART</span> · Доставка
          </span>
        </div>
        <button className="text-sm font-semibold text-brand" onClick={logout}>
          Выйти
        </button>
      </div>
      <div className="mb-3 text-sm text-ink-mute dark:text-paper-mute">
        Курьер: <b className="text-ink dark:text-paper">{courier.name}</b>
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
        onClick={() => loadRoute()}
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

      {nextStop && (
        <div className="card mb-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs text-ink-mute dark:text-paper-mute">Следующая точка</div>
            <div className="truncate font-bold">
              {nextStop.kind === "pickup" ? "🟠 Склад" : "🔵 Клиент"}: {nextStop.label}
            </div>
            <div className="text-xs text-ink-mute dark:text-paper-mute">
              ~{etaClock(nextStop.etaMinutes)} · {nextStop.legKm} км
            </div>
          </div>
          <a
            href={`https://2gis.kz/geo/${nextStop.lng},${nextStop.lat}`}
            target="_blank"
            rel="noreferrer"
            className="btn-primary flex-none !px-4 !py-2 text-sm"
          >
            В 2ГИС
          </a>
        </div>
      )}

      {showMap && (
        <DeliveryMap
          couriers={mapMe}
          warehouses={mapPickups}
          drops={mapDrops}
          routeGeometry={route?.geometry ?? null}
          className="mb-4 h-72 w-full overflow-hidden rounded-2xl"
        />
      )}

      {deliveries.length > 0 && (!route || route.stops.length === 0) && (
        <div className="card mb-4 border border-amber-300 bg-amber-50 text-sm text-amber-900 dark:border-amber-700/60 dark:bg-amber-900/20 dark:text-amber-100">
          У доставок не заданы координаты — маршрут построить нельзя. Попросите руководителя указать адрес/координаты доставки.
        </div>
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
          <div key={d.id} className={`card ${d.locked ? "opacity-60" : ""}`}>
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-bold text-brand">
                {STATUS_RU[d.status]}
              </div>
              {d.seq ? (
                <span className="rounded-full bg-paper-soft px-2 py-0.5 text-xs font-semibold text-ink-mute dark:bg-ink-mute dark:text-paper-mute">
                  #{d.seq} в очереди
                </span>
              ) : null}
            </div>
            <div className="text-lg font-extrabold">{d.customerName}</div>
            <div className="text-base">{d.items}</div>
            <a
              href={navLink(d)}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-flex items-center gap-1 font-semibold text-brand underline"
            >
              📍 {d.address || "Открыть маршрут"}
            </a>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {d.phone && (
                <a
                  href={`tel:${d.phone}`}
                  className="btn-secondary !px-4 !py-2 text-sm"
                >
                  Позвонить
                </a>
              )}

              {d.locked ? (
                <span className="text-sm text-ink-mute dark:text-paper-mute">
                  🔒 Ожидает — сначала завершите текущую доставку
                </span>
              ) : (
                <>
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
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
