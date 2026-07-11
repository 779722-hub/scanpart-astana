/**
 * Проверка листового шага каталога: GetDetailsInGroup (группа → детали с OEM).
 * Цепочка: AutoByVin → GetVinGroups (взять листовой quickGroupId) → GetDetailsInGroup.
 *   npx tsx scripts/shatem-catalog-leaf-probe.ts JN8AS05Y37X012386 [groupId]
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env" });

const WEB = (process.env.SHATEM_WEB_BASE || "https://shate-m.kz").replace(/\/+$/, "");
const COOKIE = process.env.SHATEM_SESSION_COOKIE || "";
const VIN = process.argv[2] || "JN8AS05Y37X012386";
const FORCE_GROUP = process.argv[3];
const P = "/vin/api/v1/laximoExtended";

async function get(path: string) {
  const res = await fetch(`${WEB}${path}`, {
    headers: { accept: "application/json", cookie: COOKIE, "x-requested-with": "XMLHttpRequest" },
  });
  const text = await res.text();
  let json: unknown = null;
  try { json = JSON.parse(text); } catch { /* */ }
  return { status: res.status, json, text };
}

type Node = { quickGroupId?: number; name?: string; isLink?: boolean; childs?: Node[] };
function firstLeaf(nodes: Node[] | undefined): Node | undefined {
  for (const n of nodes ?? []) {
    if (n.isLink && (!n.childs || n.childs.length === 0) && n.quickGroupId != null) return n;
    const deep = firstLeaf(n.childs);
    if (deep) return deep;
  }
  return undefined;
}

async function main() {
  if (!COOKIE) { console.error("Нет SHATEM_SESSION_COOKIE"); process.exit(1); }

  const auto = await get(`${P}/AutoByVin?vin=${encodeURIComponent(VIN)}&catalogId=&ssd=&firstFrame=&twoFrame=`);
  const v = (auto.json as { vehicles?: Array<{ vehicleId: number; catalog: string; ssd: string; brand: string; name: string }> })?.vehicles?.[0];
  if (!v) { console.error("нет vehicle (кука протухла?)", auto.status); process.exit(1); }
  const { vehicleId, catalog, ssd, brand, name } = v;

  let groupId = FORCE_GROUP;
  if (!groupId) {
    const groups = await get(`${P}/GetVinGroups?vehicleId=${vehicleId}&catalog=${encodeURIComponent(catalog)}&ssd=${encodeURIComponent(ssd)}`);
    const leaf = firstLeaf((groups.json as { treeData?: Node[] }).treeData);
    groupId = String(leaf?.quickGroupId);
    console.log(`Листовая группа: "${leaf?.name}" (quickGroupId=${groupId})`);
  }

  const url =
    `${P}/GetDetailsInGroup?groupId=${encodeURIComponent(groupId)}` +
    `&vehicleId=${vehicleId}&catalog=${encodeURIComponent(catalog)}` +
    `&ssd=${encodeURIComponent(ssd)}&brand=${encodeURIComponent(brand)}&name=${encodeURIComponent(name)}`;
  const r = await get(url);
  console.log(`\nGetDetailsInGroup(groupId=${groupId}) → ${r.status}`);
  // Печатаем структуру: ключи верхнего уровня + первые элементы массивов.
  const body = r.json as Record<string, unknown> | null;
  if (body && typeof body === "object") {
    const summary: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(body)) summary[k] = Array.isArray(val) ? `Array(${val.length})` : val;
    console.log("\nСтруктура ответа:");
    console.log(JSON.stringify(summary, null, 2));
    // Найдём массив деталей (эвристика: самый длинный массив объектов).
    let bestKey = "", best: unknown[] = [];
    for (const [k, val] of Object.entries(body)) if (Array.isArray(val) && val.length > best.length) { best = val; bestKey = k; }
    console.log(`\nПервые детали из "${bestKey}":`);
    console.log(JSON.stringify(best.slice(0, 4), null, 2));
  } else {
    console.log(r.text.slice(0, 400));
  }
}

main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
