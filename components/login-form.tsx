"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LogIn } from "lucide-react";
import { useTranslations } from "next-intl";

export function LoginForm({ locale, next }: { locale: string; next: string }) {
  const t = useTranslations("admin");
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string>("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("submitting");
    setErrorMsg("");
    try {
      const res = await fetch("/api/admin/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setErrorMsg(
          json.error === "rate_limited"
            ? `Слишком много попыток, повторите через ${json.retryAfter} с`
            : json.error === "invalid_credentials"
              ? "Неверный email или пароль"
              : "Ошибка"
        );
        setStatus("error");
        return;
      }
      router.replace(next || `/${locale}/admin`);
      router.refresh();
    } catch {
      setErrorMsg("Сервис недоступен");
      setStatus("error");
    }
  }

  return (
    <form onSubmit={submit} className="card space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-sm text-ink-mute dark:text-paper-mute">
          Введите email и пароль администратора.
        </p>
      </div>

      <div>
        <label className="label" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          type="email"
          className="input"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          disabled={status === "submitting"}
        />
      </div>

      <div>
        <label className="label" htmlFor="password">
          Пароль
        </label>
        <input
          id="password"
          type="password"
          className="input"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          disabled={status === "submitting"}
        />
      </div>

      {status === "error" && errorMsg && (
        <div className="rounded-2xl bg-brand/10 px-4 py-3 text-sm text-brand">
          {errorMsg}
        </div>
      )}

      <button className="btn-primary w-full" disabled={status === "submitting"}>
        {status === "submitting" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <>
            <LogIn className="h-4 w-4" /> Войти
          </>
        )}
      </button>
    </form>
  );
}
