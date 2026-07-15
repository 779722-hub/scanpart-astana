"use client";

import { useRef, useState } from "react";
import { Camera, Upload, Loader2 } from "lucide-react";

/**
 * Shrink a phone photo before upload: faster on mobile networks and cheaper for
 * the OCR model, without losing the resolution needed to read a VIN. Falls back
 * to the original file if the browser can't decode/encode it.
 */
async function downscale(file: File, maxDim = 1600, quality = 0.8): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((res) =>
      canvas.toBlob(res, "image/jpeg", quality)
    );
    return blob ?? file;
  } catch {
    return file;
  }
}

export function TechpassScanButton({
  onVin,
  className,
}: {
  onVin: (vin: string) => void;
  className?: string;
}) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function process(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setMsg("");
    try {
      const blob = await downscale(file);
      const form = new FormData();
      form.append("image", blob, "techpass.jpg");
      const res = await fetch("/api/vin/scan", { method: "POST", body: form });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j.ok && j.vin) {
        onVin(j.vin);
      } else if (j.error === "no_vin") {
        setMsg("Не удалось распознать VIN. Снимите/выберите техпаспорт крупно, ровно и без бликов.");
      } else if (j.error === "too_large") {
        setMsg("Фото слишком большое — уменьшите его или снимите заново.");
      } else if (j.error === "disabled") {
        setMsg("Распознавание сейчас недоступно.");
      } else {
        setMsg("Не удалось обработать фото. Попробуйте ещё раз.");
      }
    } catch {
      setMsg("Не удалось отправить фото. Проверьте связь и попробуйте снова.");
    } finally {
      setBusy(false);
    }
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    void process(file);
  }

  return (
    <div className={className}>
      {/* Camera opens the rear camera on phones; file picker opens gallery/disk. */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={onPick}
      />
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPick} />
      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={() => cameraRef.current?.click()}
          disabled={busy}
          className="btn-secondary flex-1"
        >
          <Camera className="h-4 w-4" />
          Сфотографировать
        </button>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="btn-secondary flex-1"
        >
          <Upload className="h-4 w-4" />
          Выбрать фото
        </button>
      </div>
      {busy && (
        <p className="mt-2 flex items-center gap-2 text-sm text-ink-mute dark:text-paper-mute">
          <Loader2 className="h-4 w-4 animate-spin" /> Распознаём…
        </p>
      )}
      {msg && <p className="mt-2 text-sm text-brand">{msg}</p>}
    </div>
  );
}
