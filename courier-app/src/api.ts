import { API_BASE } from "./config";

/**
 * Thin API client for the courier app. Auth is the same iron-session cookie the
 * web uses — React Native's fetch persists cookies per host automatically, so
 * once /courier/auth/login succeeds every later call is authenticated.
 */
async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: "include",
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const json = (await res.json().catch(() => ({}))) as T & { ok?: boolean; error?: string };
  if (!res.ok || json.ok === false) {
    throw new Error(json.error || `HTTP ${res.status}`);
  }
  return json;
}

export interface Courier {
  id: string;
  name: string;
  phone: string;
}
export interface Delivery {
  id: string;
  customerName: string;
  phone: string;
  whatsapp: string;
  address: string;
  lat: number | null;
  lng: number | null;
  items: string;
  warehouseIds: string[];
  status: "assigned" | "picking" | "en_route" | "delivered" | "canceled";
}
export interface RouteStop {
  kind: "pickup" | "dropoff";
  refId: string;
  label: string;
  lat: number;
  lng: number;
  legKm: number;
  etaMinutes: number;
}
export interface RoutePlan {
  stops: RouteStop[];
  totalKm: number;
  totalMinutes: number;
  skipped: string[];
}

export const api = {
  login: (login: string, password: string) =>
    req<{ courier: Courier }>("/api/courier/auth/login", {
      method: "POST",
      body: JSON.stringify({ login, password }),
    }),
  logout: () => req("/api/courier/auth/logout", { method: "POST" }),
  me: () => req<{ courier: Courier }>("/api/courier/me"),
  route: (loc?: { lat: number; lng: number }) =>
    req<{ deliveries: Delivery[]; route: RoutePlan }>(
      `/api/courier/route${loc ? `?lat=${loc.lat}&lng=${loc.lng}` : ""}`
    ),
  act: (
    id: string,
    action: "start" | "enroute" | "deliver" | "cancel",
    code?: string
  ) =>
    req<{ status: string; codeSent?: boolean; waLink?: string }>(
      `/api/courier/deliveries/${id}`,
      { method: "PATCH", body: JSON.stringify({ action, code }) }
    ),
};
