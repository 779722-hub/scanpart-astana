"use client";

import { useState } from "react";
import {
  LayoutDashboard,
  FileText,
  Palette,
  Settings,
  Package,
  Users,
  Contact,
  LogOut,
  BookOpen,
  ClipboardList,
  Warehouse,
  Menu,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import type { AuthedUser } from "@/lib/auth/guards";
import { TabDashboard } from "./tab-dashboard";
import { TabContent } from "./tab-content";
import { TabImages } from "./tab-images";
import { TabTheme } from "./tab-theme";
import { TabSettings } from "./tab-settings";
import { TabOrders } from "./tab-orders";
import { TabCustomers } from "./tab-customers";
import { TabWarehouses } from "./tab-warehouses";
import { TabCouriers } from "./tab-couriers";
import { TabDeliveries } from "./tab-deliveries";
import { TabUsers } from "./tab-users";
import { TabAliases } from "./tab-aliases";
import { TabSearchLog } from "./tab-search-log";

type TabKey =
  | "dashboard"
  | "operations"
  | "customers"
  | "warehouses"
  | "content"
  | "theme"
  | "aliases"
  | "search-log"
  | "settings"
  | "users";

interface NavItem {
  key: TabKey;
  label: string;
  Icon: typeof LayoutDashboard;
  ownerOnly?: boolean;
}
interface NavGroup {
  title: string;
  items: NavItem[];
}

// Логически связанные группы: сначала ежедневная работа, потом магазин, потом
// система. «Операции» объединяют заказы и доставки на одной странице.
const NAV: NavGroup[] = [
  {
    title: "Работа",
    items: [
      { key: "dashboard", label: "Дашборд", Icon: LayoutDashboard },
      { key: "operations", label: "Операции", Icon: Package },
      { key: "customers", label: "Клиенты", Icon: Contact },
      { key: "warehouses", label: "Локации", Icon: Warehouse },
    ],
  },
  {
    title: "Магазин",
    items: [
      { key: "content", label: "Контент", Icon: FileText },
      { key: "theme", label: "Дизайн", Icon: Palette },
      { key: "aliases", label: "Словарь поиска", Icon: BookOpen },
      { key: "search-log", label: "Что искали", Icon: ClipboardList },
    ],
  },
  {
    title: "Система",
    items: [
      { key: "settings", label: "Настройки", Icon: Settings },
      { key: "users", label: "Доступы", Icon: Users, ownerOnly: true },
    ],
  },
];

const TITLES: Record<TabKey, string> = {
  dashboard: "Дашборд",
  operations: "Операции — заказы и доставки",
  customers: "Клиенты",
  warehouses: "Локации и склады",
  content: "Контент",
  theme: "Дизайн и картинки",
  aliases: "Словарь поиска",
  "search-log": "Что искали",
  settings: "Настройки",
  users: "Доступы",
};

export function AdminShell({ locale, user }: { locale: string; user: AuthedUser }) {
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>("dashboard");
  const [mobileOpen, setMobileOpen] = useState(false);

  async function logout() {
    await fetch("/api/admin/auth/logout", { method: "POST" });
    router.push(`/${locale}/admin/login`);
    router.refresh();
  }

  const canSee = (i: NavItem) => !i.ownerOnly || user.role === "owner";

  const navList = (
    <nav className="flex flex-1 flex-col gap-4">
      {NAV.map((g) => {
        const items = g.items.filter(canSee);
        if (!items.length) return null;
        return (
          <div key={g.title}>
            <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-mute/70 dark:text-paper-mute/60">
              {g.title}
            </div>
            <div className="space-y-0.5">
              {items.map(({ key, label, Icon }) => (
                <button
                  key={key}
                  onClick={() => {
                    setTab(key);
                    setMobileOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold transition",
                    tab === key
                      ? "bg-brand text-white shadow-card"
                      : "text-ink-mute hover:bg-white hover:text-ink dark:text-paper-mute dark:hover:bg-ink-soft dark:hover:text-paper"
                  )}
                >
                  <Icon className="h-4 w-4 flex-none" />
                  {label}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </nav>
  );

  const brandHeader = (
    <div className="mb-4 flex items-center gap-2 px-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icon-192.png" alt="SCANPART" className="h-9 w-9 flex-none rounded-xl object-cover shadow-card" />
      <div className="min-w-0 leading-tight">
        <div className="text-sm font-bold">Панель управления</div>
        <div className="truncate text-[11px] text-ink-mute dark:text-paper-mute">
          {user.email} · {user.role}
        </div>
      </div>
    </div>
  );

  const logoutBtn = (
    <button
      onClick={logout}
      className="mt-2 flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold text-ink-mute transition hover:bg-white hover:text-brand dark:text-paper-mute dark:hover:bg-ink-soft"
    >
      <LogOut className="h-4 w-4" /> Выйти
    </button>
  );

  return (
    <div className="flex w-full gap-4">
      {/* Десктоп: закреплённый левый сайдбар */}
      <aside className="sticky top-3 hidden h-[calc(100vh-1.5rem)] w-56 flex-none flex-col overflow-y-auto rounded-2xl border border-paper-mute/60 bg-paper-soft/60 p-3 lg:flex dark:border-ink-mute/50 dark:bg-ink-mute/30">
        {brandHeader}
        {navList}
        {logoutBtn}
      </aside>

      {/* Мобильный: выезжающий слева ящик — так же удобно, как раньше */}
      {mobileOpen && (
        <div className="fixed inset-0 z-[70] lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 flex h-full w-64 flex-col overflow-y-auto bg-paper p-3 shadow-2xl dark:bg-ink">
            <div className="mb-2 flex items-center justify-between">
              {brandHeader}
              <button className="p-1" onClick={() => setMobileOpen(false)} aria-label="Закрыть">
                <X className="h-5 w-5" />
              </button>
            </div>
            {navList}
            {logoutBtn}
          </aside>
        </div>
      )}

      {/* Основная область — на всю ширину */}
      <main className="min-w-0 flex-1">
        <header className="mb-4 flex items-center gap-3">
          <button
            className="rounded-xl border border-paper-mute p-2 lg:hidden dark:border-ink-mute"
            onClick={() => setMobileOpen(true)}
            aria-label="Меню"
          >
            <Menu className="h-5 w-5" />
          </button>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{TITLES[tab]}</h1>
        </header>

        {tab === "dashboard" && <TabDashboard onOpenOrders={() => setTab("operations")} />}

        {/* Заказы и доставки на одной странице: на широких экранах — рядом. */}
        {tab === "operations" && (
          <div className="grid items-start gap-4 min-[1600px]:grid-cols-2">
            <TabOrders />
            <TabDeliveries />
          </div>
        )}

        {tab === "customers" && <TabCustomers />}
        {tab === "warehouses" && <TabWarehouses />}
        {tab === "content" && <TabContent />}
        {tab === "theme" && (
          <div className="space-y-4">
            <TabTheme />
            <TabImages />
          </div>
        )}
        {tab === "aliases" && <TabAliases />}
        {tab === "search-log" && <TabSearchLog />}
        {tab === "settings" && <TabSettings />}
        {tab === "users" && user.role === "owner" && (
          <div className="space-y-6">
            <div>
              <div className="mb-2 text-sm font-bold uppercase tracking-wide text-ink-mute dark:text-paper-mute">
                Менеджеры и владельцы
              </div>
              <TabUsers currentEmail={user.email} />
            </div>
            <div>
              <div className="mb-2 text-sm font-bold uppercase tracking-wide text-ink-mute dark:text-paper-mute">
                Курьеры
              </div>
              <TabCouriers />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
