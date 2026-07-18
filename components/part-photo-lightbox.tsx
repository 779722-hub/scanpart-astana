"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

/**
 * Просмотрщик фото детали. Рендерится порталом в <body>, поэтому всегда поверх
 * шапки — крестик не прячется под неё. Открывается ВПИСАННЫМ в экран (не
 * растягивается сверх своего размера — остаётся чётким).
 *
 * Мобилка: окно по размеру, увеличение — нативным пинчем пальцами.
 * Десктоп (мышь): клик по фото — зум до полного размера с прокруткой/панорамой,
 * повторный клик — назад.
 *
 * Скорость: сразу показываем уже загруженную миниатюру, а крупную (HQ) грузим
 * фоном и подменяем, когда готова — открытие ощущается мгновенным.
 */
export function PartPhotoLightbox({
  thumb,
  full,
  alt,
  onClose,
}: {
  thumb: string;
  full: string;
  alt: string;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const [hqReady, setHqReady] = useState(false);

  useEffect(() => {
    setMounted(true);
    setIsDesktop(window.matchMedia("(hover: hover) and (pointer: fine)").matches);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    // Блокируем прокрутку фона, но компенсируем ширину скроллбара, иначе на
    // Windows страница дёргается вправо при исчезновении полосы прокрутки.
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    const prevOverflow = document.body.style.overflow;
    const prevPad = document.body.style.paddingRight;
    document.body.style.overflow = "hidden";
    if (scrollbar > 0) document.body.style.paddingRight = `${scrollbar}px`;
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPad;
    };
  }, [onClose]);

  // Префетч HQ в фоне; до готовности показываем миниатюру.
  useEffect(() => {
    const img = new window.Image();
    img.onload = () => setHqReady(true);
    img.src = full;
  }, [full]);

  if (!mounted) return null;

  const shown = hqReady ? full : thumb;
  const canZoom = isDesktop; // на мобиле — нативный пинч, кастомный зум не нужен

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      style={{ touchAction: "pinch-zoom" }}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Закрыть"
        className="fixed right-3 top-3 z-[10000] flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white shadow-lg transition hover:bg-white/30"
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
          src={shown}
          alt={alt}
          onClick={canZoom ? () => setZoomed((z) => !z) : undefined}
          className={
            zoomed
              ? "max-w-none cursor-zoom-out rounded-lg bg-white"
              : `max-h-[90vh] max-w-[95vw] rounded-lg bg-white object-contain ${
                  canZoom ? "cursor-zoom-in" : ""
                }`
          }
        />
      </div>
    </div>,
    document.body
  );
}
