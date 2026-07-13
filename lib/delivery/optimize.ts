/**
 * Optimal courier ordering that INTERLEAVES warehouse pickups and customer
 * dropoffs (pure, deterministic → unit-testable).
 *
 * Unlike the naive "all pickups first" strategy, a delivery's dropoff may be
 * served between pickups — as long as it comes AFTER every warehouse pickup that
 * delivery requires. Distances are straight-line (Haversine). Exact optimum by
 * brute force for small runs; a precedence-respecting nearest-neighbour
 * heuristic beyond the cap.
 */

export interface LL {
  lat: number;
  lng: number;
}

export interface OptDelivery {
  id: string;
  lat: number;
  lng: number;
  warehouseIds: string[];
}

export interface OptWarehouse {
  id: string;
  lat: number;
  lng: number;
}

export interface OptStop {
  kind: "pickup" | "dropoff";
  refId: string;
  lat: number;
  lng: number;
}

export interface OptResult {
  order: OptStop[];
  totalKm: number;
  skipped: string[];
}

const R = 6371; // km
function haversineKm(a: LL, b: LL): number {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function finite(n: number): boolean {
  return Number.isFinite(n);
}

const BRUTE_CAP = 8; // max node count for exact brute force

interface Node {
  kind: "pickup" | "dropoff";
  refId: string;
  lat: number;
  lng: number;
  requires: number[]; // pickup node indices this node must follow (dropoffs only)
}

/** Distance from `start` through the ordered nodes. Null start → 0 first leg. */
function orderCost(start: LL | null, nodes: Node[], order: number[]): number {
  let total = 0;
  let cur: LL | null = start;
  for (const i of order) {
    const n = nodes[i];
    if (cur) total += haversineKm(cur, n);
    cur = n;
  }
  return total;
}

/** Exact optimum via precedence-respecting branch-and-bound. Deterministic. */
function bruteForce(start: LL | null, nodes: Node[]): number[] {
  const n = nodes.length;
  const visited = new Array<boolean>(n).fill(false);
  const cur: number[] = [];
  let best: number[] = [];
  let bestKm = Infinity;

  function eligible(i: number): boolean {
    for (const p of nodes[i].requires) if (!visited[p]) return false;
    return true;
  }

  function recurse(prev: LL | null, acc: number): void {
    if (acc - bestKm >= -1e-9 && best.length) return; // prune
    if (cur.length === n) {
      if (acc < bestKm - 1e-9) {
        bestKm = acc;
        best = [...cur];
      }
      return;
    }
    for (let i = 0; i < n; i++) {
      if (visited[i] || !eligible(i)) continue;
      const leg = prev ? haversineKm(prev, nodes[i]) : 0;
      visited[i] = true;
      cur.push(i);
      recurse(nodes[i], acc + leg);
      cur.pop();
      visited[i] = false;
    }
  }

  recurse(start, 0);
  return best;
}

/** Greedy nearest-neighbour honouring precedence. Deterministic. */
function heuristic(start: LL | null, nodes: Node[]): number[] {
  const n = nodes.length;
  const visited = new Array<boolean>(n).fill(false);
  const order: number[] = [];
  let cur: LL | null = start;

  for (let step = 0; step < n; step++) {
    let best = -1;
    let bestKm = Infinity;
    for (let i = 0; i < n; i++) {
      if (visited[i]) continue;
      let ok = true;
      for (const p of nodes[i].requires) if (!visited[p]) { ok = false; break; }
      if (!ok) continue;
      const km = cur ? haversineKm(cur, nodes[i]) : 0;
      if (best === -1 || km < bestKm - 1e-9) {
        bestKm = km;
        best = i;
      }
    }
    visited[best] = true;
    order.push(best);
    cur = nodes[best];
  }
  return order;
}

/**
 * Order the stops (distinct required warehouse pickups + one dropoff per
 * delivery) to minimize total travel distance from `start`, such that each
 * delivery's dropoff comes after all its required warehouse pickups.
 * - start: courier's current location; if null, start from the first stop (0 first leg).
 * - Distinct warehouses are visited once even if shared by several deliveries.
 * - A warehouse referenced by a delivery but missing from `warehouses` is ignored.
 * - Deliveries with no usable coords (NaN/Infinity) are dropped into `skipped`.
 * - Exact optimum by brute force when the node count <= 8; otherwise a
 *   precedence-respecting nearest-neighbour heuristic. Deterministic.
 */
export function optimizeRoute(
  start: LL | null,
  deliveries: OptDelivery[],
  warehouses: OptWarehouse[]
): OptResult {
  const valid = deliveries.filter((d) => finite(d.lat) && finite(d.lng));
  const skipped = deliveries
    .filter((d) => !finite(d.lat) || !finite(d.lng))
    .map((d) => d.id);

  const whById = new Map(warehouses.map((w) => [w.id, w]));

  // Distinct pickup warehouses required by valid deliveries and present.
  const pickupIndexById = new Map<string, number>();
  const nodes: Node[] = [];
  for (const d of valid) {
    for (const wid of d.warehouseIds) {
      if (pickupIndexById.has(wid)) continue;
      const w = whById.get(wid);
      if (!w) continue;
      pickupIndexById.set(wid, nodes.length);
      nodes.push({ kind: "pickup", refId: w.id, lat: w.lat, lng: w.lng, requires: [] });
    }
  }
  for (const d of valid) {
    const requires: number[] = [];
    for (const wid of d.warehouseIds) {
      const idx = pickupIndexById.get(wid);
      if (idx !== undefined) requires.push(idx);
    }
    nodes.push({ kind: "dropoff", refId: d.id, lat: d.lat, lng: d.lng, requires });
  }

  if (nodes.length === 0) return { order: [], totalKm: 0, skipped };

  const order =
    nodes.length <= BRUTE_CAP ? bruteForce(start, nodes) : heuristic(start, nodes);

  const totalKm = Math.round(orderCost(start, nodes, order) * 10) / 10;
  const stops: OptStop[] = order.map((i) => {
    const n = nodes[i];
    return { kind: n.kind, refId: n.refId, lat: n.lat, lng: n.lng };
  });

  return { order: stops, totalKm, skipped };
}
