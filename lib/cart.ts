"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "scanpart_cart_v1";
const KIND_KEY = "scanpart_cart_kind_v1";
const STORAGE_EVENT = "scanpart_cart_changed";

export type DeliveryKind = "express" | "pickup";

export interface CartItem {
  id: string;
  brand: string;
  article: string;
  name: string;
  price: number;
  quantity: number;
  availableQty: number;
  /** Opaque supplier code (Р1/М2) — passed through to the order for routing. */
  sourceCode?: string;
}

function safeParse(raw: string | null): CartItem[] {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data.filter(
      (i) =>
        i &&
        typeof i.id === "string" &&
        typeof i.brand === "string" &&
        typeof i.article === "string" &&
        typeof i.price === "number" &&
        typeof i.quantity === "number"
    );
  } catch {
    return [];
  }
}

function load(): CartItem[] {
  if (typeof window === "undefined") return [];
  return safeParse(window.localStorage.getItem(STORAGE_KEY));
}

function loadKind(): DeliveryKind {
  if (typeof window === "undefined") return "express";
  const v = window.localStorage.getItem(KIND_KEY);
  return v === "pickup" ? "pickup" : "express";
}

function save(items: CartItem[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent(STORAGE_EVENT));
}

function saveKind(k: DeliveryKind): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KIND_KEY, k);
  window.dispatchEvent(new CustomEvent(STORAGE_EVENT));
}

export function useCart() {
  const [items, setItems] = useState<CartItem[]>([]);
  const [kind, setKindState] = useState<DeliveryKind>("express");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setItems(load());
    setKindState(loadKind());
    setHydrated(true);
    const onChange = () => {
      setItems(load());
      setKindState(loadKind());
    };
    window.addEventListener(STORAGE_EVENT, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(STORAGE_EVENT, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  const add = useCallback((item: CartItem) => {
    const cur = load();
    const idx = cur.findIndex((i) => i.id === item.id);
    if (idx >= 0) {
      const merged = Math.min(
        cur[idx].quantity + item.quantity,
        item.availableQty
      );
      cur[idx] = { ...cur[idx], quantity: merged, price: item.price, availableQty: item.availableQty };
    } else {
      cur.push(item);
    }
    save(cur);
    setItems(cur);
  }, []);

  const remove = useCallback((id: string) => {
    const cur = load().filter((i) => i.id !== id);
    save(cur);
    setItems(cur);
  }, []);

  const setQty = useCallback((id: string, qty: number) => {
    const cur = load().map((i) =>
      i.id === id
        ? { ...i, quantity: Math.max(1, Math.min(qty, i.availableQty)) }
        : i
    );
    save(cur);
    setItems(cur);
  }, []);

  const setKind = useCallback((k: DeliveryKind) => {
    saveKind(k);
    setKindState(k);
  }, []);

  const clear = useCallback(() => {
    save([]);
    setItems([]);
  }, []);

  const totalCount = items.reduce((s, i) => s + i.quantity, 0);
  const itemsTotal = items.reduce((s, i) => s + i.price * i.quantity, 0);

  return {
    items,
    hydrated,
    totalCount,
    itemsTotal,
    /** Backwards-compat alias. */
    totalPrice: itemsTotal,
    kind,
    setKind,
    add,
    remove,
    setQty,
    clear,
    isInCart: (id: string) => items.some((i) => i.id === id),
  };
}
