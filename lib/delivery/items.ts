/**
 * Список товаров доставки, сгруппированный по складам и пронумерованный, чтобы
 * курьер видел, сколько и каких запчастей забрать на каждом складе. Склад
 * обозначается кодом (Р1/М2/Т3). Пример результата:
 *   1) Т3: Фильтр воздушный, Колодки тормозные ×2
 *   2) Р1: Ремень ГРМ
 */
export function groupItemsByWarehouse(
  rows: Array<{ partName: string; quantity: number; source: string }>
): string {
  const map = new Map<string, string[]>();
  for (const r of rows) {
    const code = (r.source ?? "").trim();
    const label = `${r.partName}${r.quantity > 1 ? ` ×${r.quantity}` : ""}`;
    const key = code || "—";
    const arr = map.get(key);
    if (arr) arr.push(label);
    else map.set(key, [label]);
  }
  return Array.from(map.entries())
    .map(([code, parts], i) => `${i + 1}) ${code === "—" ? "Склад" : code}: ${parts.join(", ")}`)
    .join("\n");
}
