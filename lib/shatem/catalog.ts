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
  ShatemCatalogsResponse,
  ShatemCatalogItem,
  ShatemParametersResponse,
  ShatemWizardField,
  ShatemAutoBySsdResponse,
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

// Common Russian adjective/participle/noun inflection endings, longest first.
const RU_ENDING =
  /(ого|его|ому|ему|ыми|ими|ых|их|ая|яя|ое|ее|ые|ие|ий|ый|ой|ом|ем|ах|ях|ам|ям|ов|ев|ы|и|а|я|е|о|у|ю)$/u;

/**
 * Crude Russian stem: strip a common inflection ending, then take a 6-char
 * prefix. A plain 6-char prefix failed on SHORT words — "задние"(6) stayed
 * "задние" and never matched the catalog's "заднего"; both now reduce to
 * "задн". The ending is only stripped when ≥4 chars remain, so short tokens
 * ("оси", "шрус") are left intact.
 */
export function stem(t: string): string {
  const s = t.toLowerCase();
  const stripped = s.replace(RU_ENDING, "");
  const base = stripped.length >= 4 ? stripped : s;
  return base.slice(0, 6);
}

// Leading position qualifiers to skip when finding a part's category head, so
// "Задний тормозной диск" resolves to "тормозной", not "задний".
const POSITION_RE = /^(передн|задн|лев|прав|верхн|нижн|наружн|внутрен|средн)/;

/** First significant word that isn't a position qualifier — the part's category. */
export function categoryHead(name: string): string {
  const words = name.toLowerCase().match(/[0-9a-zа-яё]{3,}/gi) ?? [];
  for (const w of words) if (!POSITION_RE.test(w)) return w;
  return words[0] ?? "";
}

/**
 * `name` contains the stem of EVERY query token (order-independent) AND the
 * part's CATEGORY head is one the query names. The head check rejects
 * accessories that merely mention the part — e.g. "Крепление масляного фильтра"
 * for query "масляный фильтр" (head "крепление" ≠ query) — while keeping the
 * filter itself and position-qualified parts ("Задний тормозной диск").
 */
export function nameMatchesAll(name: string, qtokens: string[]): boolean {
  if (!qtokens.length) return false;
  const hay = name.toLowerCase();
  if (!qtokens.every((t) => hay.includes(stem(t)))) return false;
  const head = categoryHead(name);
  return !head || qtokens.some((t) => head.includes(stem(t)));
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
      // Weight each matched token by its stem length: a category noun like
      // "колодк"(6) outranks a position qualifier like "задн"(4), so brake-pad
      // groups sort above unrelated "…задний" groups (lamps, seals, glass).
      const score = qtokens.reduce(
        (n, t) => n + (hay.includes(stem(t)) ? stem(t).length : 0),
        0
      );
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
 * Known vehicle (from VIN or the by-model wizard) + free-text name → OEM part
 * candidates for that vehicle. Filters details to those whose name matches the
 * query words. The vehicle must carry the {vehicleId, catalog, ssd} triple.
 */
export async function articlesByVehicleAndName(
  vehicle: ShatemVehicle,
  name: string,
  opts: { maxGroups?: number; maxParts?: number } = {}
): Promise<CatalogPart[]> {
  const tree = await vinGroups(vehicle);
  const leaves = matchingLeafGroups(tree, name, opts.maxGroups ?? 6);
  if (!leaves.length) return [];

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
      if (parts.length >= (opts.maxParts ?? 20)) return parts;
    }
  }
  return parts;
}

/**
 * VIN + free-text name → OEM part candidates for that vehicle.
 */
export async function articlesByVinAndName(
  vin: string,
  name: string,
  opts: { maxGroups?: number; maxParts?: number } = {}
): Promise<{ vehicle: ShatemVehicle | null; parts: CatalogPart[] }> {
  const vehicle = await vehicleByVin(vin);
  if (!vehicle) return { vehicle: null, parts: [] };
  const parts = await articlesByVehicleAndName(vehicle, name, opts);
  return { vehicle, parts };
}

// ---------------------------------------------------------------------------
// By-model wizard (no VIN): GetCatalogs → Parameters (cascade) → AutoBySsd →
// vehicle, which then feeds the exact same groups → OEM → price chain above.
// Endpoint names confirmed live via DevTools network capture.
// ---------------------------------------------------------------------------

export interface CatalogInfo {
  code: string; // catalogId, e.g. "INFINITI201809"
  brand: string;
  name: string;
}

/** Manufacturer catalogs that support the by-model wizard, sorted by name. */
export async function listCatalogs(): Promise<CatalogInfo[]> {
  const res = await catalogGet<ShatemCatalogsResponse>(`${P}/GetCatalogs`);
  return (res.items ?? [])
    .filter((c: ShatemCatalogItem) => c.supportParameterIdentification && c.code)
    .map((c) => ({ code: c.code, brand: c.brand, name: c.name || c.brand }))
    .sort((a, b) => a.name.localeCompare(b.name, "ru"));
}

/** One wizard step: re-call with an option's `key` as the next ssd. */
export async function wizardParameters(
  catalogId: string,
  ssd: string
): Promise<ShatemWizardField[]> {
  const res = await catalogGet<ShatemParametersResponse>(
    `${P}/Parameters?vin=&catalogId=${q(catalogId)}&ssd=${q(ssd)}&firstFrame=&twoFrame=`
  );
  return res.fields ?? [];
}

/** Resolve the accumulated ssd to concrete vehicle modifications. */
export async function wizardVehicles(
  catalogId: string,
  ssd: string
): Promise<ShatemVehicle[]> {
  const res = await catalogGet<ShatemAutoBySsdResponse>(
    `${P}/AutoBySsd?vin=&catalogId=${q(catalogId)}&ssd=${q(ssd)}&firstFrame=&twoFrame=`
  );
  return res.vehicles ?? [];
}
