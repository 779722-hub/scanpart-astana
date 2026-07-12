"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

/** VIN shown as a button — one click copies it to the clipboard. */
export function CopyVin({ vin }: { vin: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(vin);
    } catch {
      // Fallback for older browsers / insecure contexts.
      const ta = document.createElement("textarea");
      ta.value = vin;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch {
        /* ignore */
      }
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label="Скопировать VIN"
      className="flex w-full items-center justify-between gap-3 rounded-2xl bg-paper-soft p-3 text-left transition hover:bg-paper-mute dark:bg-ink-mute dark:hover:bg-ink"
    >
      <span className="min-w-0">
        <span className="block text-xs text-ink-mute dark:text-paper-mute">
          {copied ? "Скопировано" : "Ваш VIN — нажмите, чтобы скопировать"}
        </span>
        <span className="block break-all font-mono text-sm font-bold">{vin}</span>
      </span>
      {copied ? (
        <Check className="h-5 w-5 flex-none text-emerald-600" />
      ) : (
        <Copy className="h-5 w-5 flex-none text-ink-mute dark:text-paper-mute" />
      )}
    </button>
  );
}
