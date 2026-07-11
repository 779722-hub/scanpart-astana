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

/** Collect leaf groups whose name (or an ancestor's) matches the query. */
function matchingLeafGroups(tree: ShatemGroupNode[], query: string, limit = 8): ShatemGroupNode[] {
  const ql = query.trim().toLowerCase();
  const out: ShatemGroupNode[] = [];
  const seen = new Set<number>();
  const pushLeaves = (node: ShatemGroupNode) => {
    if (node.isLink && (!node.childs || node.childs.length === 0)) {
      if (!seen.has(node.quickGroupId)) {
        seen.add(node.quickGroupId);
        out.push(node);
      }
      return;
    }
    for (const c of node.childs ?? []) pushLeaves(c);
  };
  const walk = (nodes: ShatemGroupNode[], ancestorMatched: boolean) => {
    for (const n of nodes) {
      if (out.length >= limit) return;
      const matched = ancestorMatched || n.name.toLowerCase().includes(ql);
      if (matched && n.isLink && (!n.childs || n.childs.length === 0)) pushLeaves(n);
      else if (matched && (n.childs?.length ?? 0) > 0) walk(n.childs!, true);
      else if (n.childs?.length) walk(n.childs, false);
    }
  };
  walk(tree, false);
  return out.slice(0, limit);
}

const tokens = (s: string) =>
  s.toLowerCase().split(/[\s,./()-]+/).filter((w) => w.length >= 3);

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
  const matches = (partName: string) => {
    const hay = partName.toLowerCase();
    return want.length === 0 || want.every((t) => hay.includes(t));
  };

  const parts: CatalogPart[] = [];
  const seen = new Set<string>();
  for (const r of groups) {
    if (r.status !== "fulfilled") continue;
    for (const p of r.value) {
      if (!matches(p.name)) continue;
      const key = p.oem.toUpperCase();
      if (seen.has(key)) continue;
      seen.add(key);
      parts.push(p);
      if (parts.length >= (opts.maxParts ?? 20)) return { vehicle, parts };
    }
  }
  return { vehicle, parts };
}
