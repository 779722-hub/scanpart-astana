"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Users, Search, MessageCircle, Phone, Car } from "lucide-react";
import { normalizePhoneE164 } from "@/lib/schemas";

interface Customer {
  email: string;
  name: string;
  phone: string;
  whatsapp: string;
  vins: string[];
  createdAt: string;
}

export function TabCustomers() {
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    fetch("/api/admin/customers")
      .then((r) => r.json())
      .then((j) => setCustomers(j.ok ? (j.customers as Customer[]) : []))
      .catch(() => setCustomers([]));
  }, []);

  const filtered = useMemo(() => {
    if (!customers) return [];
    const needle = q.trim().toLowerCase();
    const rows = customers.slice().reverse();
    if (!needle) return rows;
    return rows.filter(
      (c) =>
        c.name.toLowerCase().includes(needle) ||
        c.email.toLowerCase().includes(needle) ||
        c.phone.toLowerCase().includes(needle) ||
        c.whatsapp.toLowerCase().includes(needle) ||
        c.vins.some((v) => v.toLowerCase().includes(needle))
    );
  }, [customers, q]);

  if (!customers) {
    return (
      <div className="card flex justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-center gap-2">
        <Search className="h-4 w-4 text-ink-mute" />
        <input
          className="input flex-1 min-w-[12rem]"
          placeholder="Поиск: имя, email, телефон, VIN"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <p className="text-xs text-ink-mute dark:text-paper-mute">
          {filtered.length}/{customers.length}
        </p>
      </div>

      {filtered.length === 0 ? (
        <div className="card text-center text-sm text-ink-mute">
          <Users className="mx-auto mb-2 h-8 w-8" />
          Зарегистрированных клиентов нет.
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((c) => (
            <article key={c.email} className="card">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-lg font-bold">{c.name || "—"}</div>
                  <div className="text-sm text-ink-mute dark:text-paper-mute break-all">
                    {c.email}
                  </div>
                  {c.createdAt && (
                    <div className="text-xs text-ink-mute dark:text-paper-mute">
                      Регистрация: {new Date(c.createdAt).toLocaleDateString("ru")}
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {c.phone && (
                    <a
                      href={`tel:${normalizePhoneE164(c.phone)}`}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-paper-mute px-3 py-1.5 text-sm font-semibold transition hover:border-brand hover:text-brand dark:border-ink-mute"
                    >
                      <Phone className="h-4 w-4" />
                      {c.phone}
                    </a>
                  )}
                  {c.whatsapp && (
                    <a
                      href={`https://wa.me/${normalizePhoneE164(c.whatsapp)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-emerald-600"
                    >
                      <MessageCircle className="h-4 w-4" />
                      WhatsApp
                    </a>
                  )}
                </div>
              </div>
              {c.vins.length > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-paper-mute/50 pt-3 text-xs dark:border-ink-mute/50">
                  <Car className="h-4 w-4 text-brand" />
                  {c.vins.map((v) => (
                    <code
                      key={v}
                      className="rounded-lg bg-paper-soft px-2 py-1 font-mono dark:bg-ink-mute"
                    >
                      {v}
                    </code>
                  ))}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
