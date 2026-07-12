"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2, Search } from "lucide-react";

export function SearchInputForm({
  locale,
  kind,
}: {
  locale: string;
  kind: "article" | "name";
}) {
  const t = useTranslations(kind);
  const router = useRouter();
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const query = q.trim();
    if (!query) return;
    setLoading(true);
    const params = new URLSearchParams({ q: query, k: kind });
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
