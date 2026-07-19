/** Delivery domain — shared types + pure status logic (fully unit-testable). */

export interface Courier {
  id: string;
  name: string;
  phone: string;
  whatsapp?: string;
  login: string;
  passwordHash: string;
  active: boolean;
}

export type DeliveryStatus =
  | "new" // created, no courier yet
  | "assigned" // courier assigned, not started
  | "picking" // collecting from warehouses
  | "en_route" // heading to the customer (handover code issued)
  | "delivered" // handed over + code confirmed
  | "canceled";

export const DELIVERY_STATUSES: DeliveryStatus[] = [
  "new",
  "assigned",
  "picking",
  "en_route",
  "delivered",
  "canceled",
];

export const STATUS_LABEL_RU: Record<DeliveryStatus, string> = {
  new: "Новая",
  assigned: "Назначена",
  picking: "Забирает со склада",
  en_route: "В пути к клиенту",
  delivered: "Вручена",
  canceled: "Отменена",
};

/** Allowed forward transitions the courier/manager may apply. */
const NEXT: Record<DeliveryStatus, DeliveryStatus[]> = {
  new: ["assigned", "canceled"],
  assigned: ["picking", "canceled"],
  picking: ["en_route", "canceled"],
  en_route: ["delivered", "canceled"],
  delivered: [],
  canceled: [],
};

export function canTransition(from: DeliveryStatus, to: DeliveryStatus): boolean {
  return NEXT[from]?.includes(to) ?? false;
}

export interface Delivery {
  id: string;
  createdAt: string;
  customerName: string;
  phone: string;
  whatsapp: string;
  address: string;
  lat: number | null;
  lng: number | null;
  items: string; // human summary of what is being delivered
  warehouseIds: string[]; // pickup points this delivery must collect from
  courierId: string; // "" when unassigned
  status: DeliveryStatus;
  handoverCode: string; // 4-digit, issued when en_route; "" otherwise
  deliveredAt: string; // ISO when delivered
}
