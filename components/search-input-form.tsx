"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2, Search } from "lucide-react";

interface SessionVehicle {
  make: string;
  model: string;
  year: string;
}

export function SearchInputForm({
  locale,
  kind,
  vehicle,
}: {
  locale: string;
  kind: "article" | "name";
  vehicle?: SessionVehicle | null;
}) {
  const t = useTranslations(kind);
  const router = useRouter();
  const [q, setQ] = useState("");
  // For name search with vehicle context, default to strict filter ON.
  const [strict, setStrict] = useState(kind === "name" && Boolean(vehicle));
  const [loading, setLoading] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const query = q.trim();
    if (!query) return;
    setLoading(true);
    const params = new URLSearchParams({ q: query, k: kind });
    if (strict && vehicle) params.set("strict", "1");
    if (kind === "name") params.set("k", "name");
    router.push(`/${locale}/results?${params.toString()}`);
  }

  return (
    <form onSubmit={submit} className="card space-y-5">
      <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
      <p className="text-ink-mute dark:text-paper-mute">{t("hint")}</p>
      <div>
        <label className="label" htmlFor="q">
          {t("title")}
        </label>
        <input
          id="q"
          className="input"
          placeholder={t("placeholder")}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoComplete="off"
          autoFocus
          required
          disabled={loading}
        />
      </div>

      {kind === "name" && vehicle && (
        <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-paper-soft p-3 text-sm dark:bg-ink-mute">
          <input
            type="checkbox"
            checked={strict}
            onChange={(e) => setStrict(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-brand"
          />
          <span>
            <span className="font-semibold">
              Только для {vehicle.make}
              {vehicle.model !== "—" ? ` ${vehicle.model}` : ""}
            </span>
            <span className="ml-1 text-ink-mute dark:text-paper-mute">
              — отсечь запчасти, в названии которых нет вашей марки.
            </span>
          </span>
        </label>
      )}

      <button className="btn-primary w-full" disabled={loading}>
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <>
            <Search className="h-4 w-4" />
            {t("submit")}
          </>
        )}
      </button>
    </form>
  );
}
