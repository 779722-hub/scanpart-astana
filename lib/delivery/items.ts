/**
 * Позиции доставки — по одной на строку, пронумерованные, с указанием склада
 * кодом (Р1/М2/Т3), как во вкладке «Заказы». Курьеру сразу видно, что и откуда
 * забирать. Пример:
 *   1) Фильтр воздушный — склад Т3
 *   2) Колодки тормозные ×2 — склад Т3
 *   3) Ремень ГРМ — склад Р1
 */
export function formatDeliveryItems(
  rows: Array<{ partName: string; quantity: number; source: string }>
): string {
  return rows
    .map((r, i) => {
      const qty = r.quantity > 1 ? ` ×${r.quantity}` : "";
      const code = (r.source ?? "").trim();
      const wh = code ? ` — склад ${code}` : "";
      return `${i + 1}) ${r.partName}${qty}${wh}`;
    })
    .join("\n");
}
