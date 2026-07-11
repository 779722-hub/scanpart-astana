/**
 * Shate-M Laximo catalog (cookie session): VIN → vehicle → groups → OEM parts.
 * Data chain verified live via scripts/shatem-catalog-*-probe.ts.
 */
import { catalogGet } from "./web-session";
import type {
  ShatemAutoByVinResponse,
  ShatemVehicle,
  ShatemVinGroupsResponse,
  ShatemGroupNode,
  ShatemDetailsInGroupResponse,
} from "./types";

const P = "/vin/api/v1/laximoExtended";
const q = (v: string | number) => encodeURIComponent(String(v));

/** One catalog part, ready to be priced through the trading adapters. */
export interface CatalogPart {
  oem: string;
  name: string;
  applicableModels?: string;
}

/** Step 1 — VIN → identified vehicle (also our VIN decode replacement). */
export async function vehicleByVin(vin: string): Promise<ShatemVehicle | null> {
  const res = await catalogGet<ShatemAutoByVinResponse>(
    `${P}/AutoByVin?vin=${q(vin)}&catalogId=&ssd=&firstFrame=&twoFrame=`
  );
  return res.vehicles?.[0] ?? null;
}

/** Step 2 — vehicle → quick-group tree. */
async function vinGroups(v: ShatemVehicle): Promise<ShatemGroupNode[]> {
  const res = await catalogGet<ShatemVinGroupsResponse>(
    `${P}/GetVinGroups?vehicleId=${q(v.vehicleId)}&catalog=${q(v.catalog)}&ssd=${q(v.ssd)}`
  );
  return res.treeData ?? [];
}

/** Step 3 — group → parts (flattened across categories/units). */
async function detailsInGroup(v: ShatemVehicle, groupId: number): Promise<CatalogPart[]> {
  const res = await catalogGet<ShatemDetailsInGroupResponse>(
    `${P}/GetDetailsInGroup?groupId=${q(groupId)}&vehicleId=${q(v.vehicleId)}` +
      `&catalog=${q(v.catalog)}&ssd=${q(v.ssd)}&brand=${q(v.brand)}&name=${q(v.name)}`
  );
  const parts: CatalogPart[] = [];
  for (const category of Object.values(res)) {
    for (const unit of category.units ?? []) {
      for (const d of unit.details ?? []) {
        if (!d.oem) continue;
        parts.push({
          oem: d.oem,
          name: d.name,
          applicableModels: d.innerAttributes?.find((a) => a.key === "applicableModels")?.value,
        });
      }
    }
  }
  return parts;
}

/** Query tokens: lowercased letter/digit words ≥3 chars (splits on any punctuation). */
export function tokens(s: string): string[] {
  return s.toLowerCase().split(/[^0-9a-zа-яё]+/i).filter((w) => w.length >= 3);
}

/**
 * Crude Russian stem: a 6-char prefix. Handles the common inflections that
 * broke naive substring matching — "передние"/"переднего"→"передн",
 * "тормозные"/"тормоза"→"тормоз", "масляный"/"масляного"→"маслян".
 */
export function stem(t: string): string {
  return t.slice(0, 6);
}

/** `name` contains the stem of EVERY query token (order-independent). */
export function nameMatchesAll(name: string, qtokens: string[]): boolean {
  if (!qtokens.length) return false;
  const hay = name.toLowerCase();
  return qtokens.every((t) => hay.includes(stem(t)));
}

/**
 * Leaf groups relevant to the query, ranked by how many query tokens their
 * name matches (a group matching more tokens is more specific → first). Naive
 * whole-string substring matching failed on Russian word order/inflection, so
 * we score by per-token stems instead.
 */
export function matchingLeafGroups(
  tree: ShatemGroupNode[],
  query: string,
  limit = 6
): ShatemGroupNode[] {
  const qtokens = tokens(query);
  if (!qtokens.length) return [];
  const scored: Array<{ node: ShatemGroupNode; score: number }> = [];
  const seen = new Set<number>();
  const visit = (node: ShatemGroupNode) => {
    const isLeaf = node.isLink && (!node.childs || node.childs.length === 0);
    if (isLeaf && node.quickGroupId != null && !seen.has(node.quickGroupId)) {
      const hay = node.name.toLowerCase();
      const score = qtokens.reduce((n, t) => n + (hay.includes(stem(t)) ? 1 : 0), 0);
      if (score > 0) {
        seen.add(node.quickGroupId);
        scored.push({ node, score });
      }
    }
    for (const c of node.childs ?? []) visit(c);
  };
  for (const n of tree) visit(n);
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.node);
}

/**
 * VIN + free-text name → OEM part candidates for that vehicle.
 * Filters details to those whose name matches the query words.
 */
export async function articlesByVinAndName(
  vin: string,
  name: string,
  opts: { maxGroups?: number; maxParts?: number } = {}
): Promise<{ vehicle: ShatemVehicle | null; parts: CatalogPart[] }> {
  const vehicle = await vehicleByVin(vin);
  if (!vehicle) return { vehicle: null, parts: [] };

  const tree = await vinGroups(vehicle);
  const leaves = matchingLeafGroups(tree, name, opts.maxGroups ?? 6);
  if (!leaves.length) return { vehicle, parts: [] };

  const groups = await Promise.allSettled(
    leaves.map((g) => detailsInGroup(vehicle, g.quickGroupId))
  );

  const want = tokens(name);
  const parts: CatalogPart[] = [];
  const seen = new Set<string>();
  for (const r of groups) {
    if (r.status !== "fulfilled") continue;
    for (const p of r.value) {
      if (want.length && !nameMatchesAll(p.name, want)) continue;
      const key = p.oem.toUpperCase();
      if (seen.has(key)) continue;
      seen.add(key);
      parts.push(p);
      if (parts.length >= (opts.maxParts ?? 20)) return { vehicle, parts };
    }
  }
  return { vehicle, parts };
}
