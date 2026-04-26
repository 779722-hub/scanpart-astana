"use client";

import { useState } from "react";
import {
  LayoutDashboard,
  FileText,
  Image as ImageIcon,
  Palette,
  Settings,
  Package,
  Users,
  LogOut,
  Send,
  BookOpen,
  ClipboardList,
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
import { TabUsers } from "./tab-users";
import { TabAliases } from "./tab-aliases";
import { TabSearchLog } from "./tab-search-log";

type TabKey =
  | "dashboard"
  | "content"
  | "images"
  | "theme"
  | "settings"
  | "aliases"
  | "search-log"
  | "orders"
  | "users";

interface TabDef {
  key: TabKey;
  label: string;
  Icon: typeof LayoutDashboard;
  ownerOnly?: boolean;
}

const TABS: TabDef[] = [
  { key: "dashboard", label: "Дашборд", Icon: LayoutDashboard },
  { key: "content", label: "Контент", Icon: FileText },
  { key: "images", label: "Картинки", Icon: ImageIcon },
  { key: "theme", label: "Дизайн", Icon: Palette },
  { key: "settings", label: "Настройки", Icon: Settings },
  { key: "aliases", label: "Словарь поиска", Icon: BookOpen },
  { key: "search-log", label: "Что искали", Icon: ClipboardList },
  { key: "orders", label: "Заказы", Icon: Package },
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
  const [publishing, setPublishing] = useState(false);
  const visibleTabs = TABS.filter((t) => !t.ownerOnly || user.role === "owner");

  async function publish() {
    setPublishing(true);
    try {
      await fetch("/api/admin/revalidate", { method: "POST" });
    } finally {
      setPublishing(false);
    }
  }

  async function logout() {
    await fetch("/api/admin/auth/logout", { method: "POST" });
    router.push(`/${locale}/admin/login`);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Панель управления</h1>
          <p className="mt-1 text-sm text-ink-mute dark:text-paper-mute">
            {user.email} · <span className="font-semibold">{user.role}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={publish}
            disabled={publishing}
            className="btn-secondary"
            title="Сбросить кеш и опубликовать изменения"
          >
            <Send className="h-4 w-4" />
            {publishing ? "Публикация…" : "Опубликовать"}
          </button>
          <button onClick={logout} className="btn-secondary" title="Выйти">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>

      <nav className="flex flex-wrap gap-2">
        {visibleTabs.map(({ key, label, Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              "inline-flex items-center gap-2 rounded-2xl border px-4 py-2 text-sm font-semibold transition",
              tab === key
                ? "border-brand bg-brand text-white shadow-card"
                : "border-paper-mute bg-white hover:border-ink-mute dark:border-ink-mute dark:bg-ink-soft dark:hover:border-paper-mute"
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </nav>

      <div>
        {tab === "dashboard" && <TabDashboard />}
        {tab === "content" && <TabContent />}
        {tab === "images" && <TabImages />}
        {tab === "theme" && <TabTheme />}
        {tab === "settings" && <TabSettings />}
        {tab === "aliases" && <TabAliases />}
        {tab === "search-log" && <TabSearchLog />}
        {tab === "orders" && <TabOrders />}
        {tab === "users" && user.role === "owner" && (
          <TabUsers currentEmail={user.email} />
        )}
      </div>
    </div>
  );
}
