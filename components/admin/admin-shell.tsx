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
  Truck,
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
  | "content"
  | "theme"
  | "settings"
  | "aliases"
  | "search-log"
  | "orders"
  | "customers"
  | "warehouses"
  | "deliveries"
  | "users";

interface TabDef {
  key: TabKey;
  label: string;
  Icon: typeof LayoutDashboard;
  ownerOnly?: boolean;
}

const TABS: TabDef[] = [
  { key: "dashboard", label: "Дашборд", Icon: LayoutDashboard },
  { key: "orders", label: "Заказы", Icon: Package },
  { key: "customers", label: "Клиенты", Icon: Contact },
  { key: "deliveries", label: "Доставки", Icon: Truck },
  { key: "warehouses", label: "Локации", Icon: Warehouse },
  { key: "content", label: "Контент", Icon: FileText },
  { key: "theme", label: "Дизайн", Icon: Palette },
  { key: "aliases", label: "Словарь поиска", Icon: BookOpen },
  { key: "search-log", label: "Что искали", Icon: ClipboardList },
  { key: "settings", label: "Настройки", Icon: Settings },
  { key: "users", label: "Доступы", Icon: Users, ownerOnly: true },
];

export function AdminShell({
  locale,
  user,
}: {
  locale: string;
  user: AuthedUser;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>("dashboard");
  const visibleTabs = TABS.filter((t) => !t.ownerOnly || user.role === "owner");

  async function logout() {
    await fetch("/api/admin/auth/logout", { method: "POST" });
    router.push(`/${locale}/admin/login`);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/icon-192.png"
            alt="SCANPART"
            className="h-11 w-11 flex-none rounded-xl object-cover shadow-card"
          />
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Панель управления</h1>
            <p className="mt-1 text-sm text-ink-mute dark:text-paper-mute">
              {user.email} · <span className="font-semibold">{user.role}</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Отдельная «Опубликовать» убрана: каждое «Сохранить» во вкладках уже
              публикует изменение (ревалидирует свой кэш). Две кнопки путали. */}
          <button onClick={logout} className="btn-secondary" title="Выйти">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>

      <nav className="flex flex-wrap gap-1.5 rounded-2xl bg-paper-soft p-1.5 dark:bg-ink-mute/50">
        {visibleTabs.map(({ key, label, Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              "inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition",
              tab === key
                ? "bg-brand text-white shadow-card"
                : "text-ink-mute hover:bg-white hover:text-ink dark:text-paper-mute dark:hover:bg-ink-soft dark:hover:text-paper"
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </nav>

      <div>
        {tab === "dashboard" && (
          <TabDashboard onOpenOrders={() => setTab("orders")} />
        )}
        {tab === "content" && <TabContent />}
        {/* «Картинки» переехали сюда — управление изображениями логичнее в «Дизайне». */}
        {tab === "theme" && (
          <div className="space-y-4">
            <TabTheme />
            <TabImages />
          </div>
        )}
        {tab === "settings" && <TabSettings />}
        {tab === "aliases" && <TabAliases />}
        {tab === "search-log" && <TabSearchLog />}
        {tab === "orders" && <TabOrders />}
        {tab === "customers" && <TabCustomers />}
        {tab === "warehouses" && <TabWarehouses />}
        {tab === "deliveries" && <TabDeliveries />}
        {/* «Курьеры» переехали в «Доступы»: доступ менеджеров и доступ курьеров —
            в одном месте, но разделены. */}
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
      </div>
    </div>
  );
}
