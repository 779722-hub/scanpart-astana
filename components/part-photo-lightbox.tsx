"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

/**
 * Просмотрщик фото детали. Открывается ВПИСАННЫМ в экран (не растягивается сверх
 * своего размера — остаётся чётким), клик по картинке увеличивает до полного
 * размера с прокруткой/панорамой, повторный клик — назад. Закрытие: крестик,
 * клик по фону, Esc. Работает и на десктопе, и на мобиле.
 */
export function PartPhotoLightbox({
  src,
  alt,
  onClose,
}: {
  src: string;
  alt: string;
  onClose: () => void;
}) {
  const [zoomed, setZoomed] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Закрыть"
        className="absolute right-3 top-3 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/30"
      >
        <X className="h-6 w-6" />
      </button>

      <div
        className={
          zoomed
            ? "max-h-full max-w-full overflow-auto"
            : "flex max-h-full max-w-full items-center justify-center"
        }
        onClick={(e) => e.stopPropagation()}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          onClick={() => setZoomed((z) => !z)}
          className={
            zoomed
              ? "max-w-none cursor-zoom-out rounded-lg bg-white"
              : "max-h-[85vh] max-w-[92vw] cursor-zoom-in rounded-lg bg-white object-contain"
          }
        />
      </div>
    </div>
  );
}
