"use client";

import { useEffect, useRef } from "react";

/**
 * Ставит курсор в поле только на десктопе.
 *
 * На телефоне autoFocus при открытии страницы сразу поднимает клавиатуру, а
 * она закрывает больше половины экрана — вместе с тем, что лежит под полем:
 * кнопками «Сфотографировать»/«Выбрать фото» на поиске по VIN и голосовым
 * поиском на поиске по названию. Человек их просто не видит.
 *
 * Клавиатура должна появляться тогда, когда по полю тапнули сами.
 * Отличаем мышь от пальца по (hover: hover) and (pointer: fine) — тот же
 * приём, что и для наведения на карточку товара в globals.css.
 */
export function useDesktopAutoFocus<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
      ref.current?.focus();
    }
  }, []);
  return ref;
}
