// Dijkstra distance fields and flow-field movement.

import { blocked, TILE, clamp, type MapDef } from './map.ts';
import { WORK } from '../data/buildings.ts';
import type { Unit, World } from './types.ts';
import { allied } from './world.ts';

type CostFn = (i: number) => number;

export function dijk(cols: number, rows: number, starts: number | number[], costFn: CostFn): Float32Array {
  const n = cols * rows;
  const dist = new Float32Array(n).fill(Infinity);
  // Costs once per node, not once per neighbor visit.
  const cost = new Float32Array(n);
  for (let i = 0; i < n; i++) cost[i] = costFn(i);
  // Binary heap in typed arrays: keys and node ids side by side, grown when full.
  let cap = 1024, size = 0;
  let hk = new Float64Array(cap), hn = new Int32Array(cap);
  const push = (k: number, node: number): void => {
    if (size === cap) { cap *= 2; const nk = new Float64Array(cap), nn = new Int32Array(cap); nk.set(hk); nn.set(hn); hk = nk; hn = nn; }
    let i = size++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (hk[p] <= k) break;
      hk[i] = hk[p]; hn[i] = hn[p]; i = p;
    }
    hk[i] = k; hn[i] = node;
  };
  const pop = (): number => {
    const top = hn[0];
    popKey = hk[0];
    size--;
    if (size > 0) {
      const k = hk[size], node = hn[size];
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = -1, mk = k;
        if (l < size && hk[l] < mk) { m = l; mk = hk[l]; }
        if (r < size && hk[r] < mk) { m = r; mk = hk[r]; }
        if (m < 0) break;
        hk[i] = hk[m]; hn[i] = hn[m]; i = m;
      }
      hk[i] = k; hn[i] = node;
    }
    return top;
  };
  let popKey = 0;
  for (const s of Array.isArray(starts) ? starts : [starts]) { dist[s] = 0; push(0, s); }
  while (size > 0) {
    const cur = pop(), k = popKey;
    if (k > dist[cur]) continue;
    const cx = cur % cols, cy = (cur / cols) | 0;
    const d0 = dist[cur];
    for (let dy = -1; dy <= 1; dy++) {
      const ny = cy + dy;
      if (ny < 0 || ny >= rows) continue;
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = cx + dx;
        if (nx < 0 || nx >= cols) continue;
        const ni = ny * cols + nx, c = cost[ni];
        if (c === Infinity) continue;
        if (dx && dy && (cost[cy * cols + nx] === Infinity || cost[ny * cols + cx] === Infinity)) continue;
        // dist is float32: push the value it will actually hold, or the pop-time staleness check drops the node.
        const nd = Math.fround(d0 + c * (dx && dy ? 1.414 : 1));
        if (nd < dist[ni]) { dist[ni] = nd; push(nd, ni); }
      }
    }
  }
  return dist;
}

/** Terrain-only distance from a tile. Trees cost 2, water and rock are impassable. */
export function distField(m: MapDef, tx: number, ty: number): Float32Array {
  const cost = (i: number): number => { const t = m.tiles[i]; return blocked(t) ? Infinity : t === 2 ? 2 : 1; };
  return dijk(m.cols, m.rows, ty * m.cols + tx, cost);
}

/** True when base 1 can reach base 0 over terrain. */
export function connected(m: MapDef): boolean {
  const d = distField(m, m.bases[1].tx, m.bases[1].ty);
  return d[m.bases[0].ty * m.cols + m.bases[0].tx] < Infinity;
}

/** Recompute every slot's flow field toward all hostile bases. Enemy walls enter as breach cost. */
export function computeFlow(w: World): void {
  const m = w.map;
  const costFor = (team: number) => (i: number): number => {
    const t = m.tiles[i];
    const b = w.bmap.get(i);
    if (b && b.kind === 'bridge') return 1;
    if (blocked(t)) return Infinity;
    const c = t === 2 ? 2 : t === 1 ? WORK.roadCost : 1;
    if (!b) return c;
    if (b.kind === 'trap') return c + (allied(w, b.team, team) ? 0 : 1.5);
    if (b.kind === 'gate') return allied(w, b.team, team) ? c : c + (b.locked ? 6 + b.hp / 30 : 1.5);
    return allied(w, b.team, team) ? Infinity : c + 6 + b.hp / 30;
  };
  w.flow = [];
  for (let i = 0; i < w.nP; i++) {
    if (!w.slots[i].alive) { w.flow.push(null); continue; }
    // Seeds are every living hostile settlement. Skirmish has one per slot.
    const starts: number[] = [];
    for (let j = 0; j < w.nP; j++) {
      if (!w.slots[j].alive || allied(w, i, j)) continue;
      for (const b of w.slots[j].settlements) if (b.hp > 0) starts.push(((b.y / TILE) | 0) * m.cols + ((b.x / TILE) | 0));
    }
    w.flow.push(starts.length ? dijk(m.cols, m.rows, starts, costFor(i)) : null);
  }
}

/** Per-slot distance field to the slot's own settlements over terrain the slot can walk. */
export function computeHome(w: World): void {
  const m = w.map;
  const costFor = (team: number) => (i: number): number => {
    const t = m.tiles[i];
    const b = w.bmap.get(i);
    if (b && b.kind === 'bridge') return 1;
    if (blocked(t)) return Infinity;
    const c = t === 2 ? 2 : t === 1 ? WORK.roadCost : 1;
    if (!b || b.kind === 'trap') return c;
    if (b.kind === 'gate') return allied(w, b.team, team) || !b.locked ? c : Infinity;
    return Infinity;
  };
  w.home = [];
  for (let i = 0; i < w.nP; i++) {
    const starts: number[] = [];
    for (const b of w.slots[i].settlements) if (b.hp > 0) starts.push(((b.y / TILE) | 0) * m.cols + ((b.x / TILE) | 0));
    w.home.push(starts.length ? dijk(m.cols, m.rows, starts, costFor(i)) : null);
  }
}

// ---------- sea movement ----------
// Water never changes during play, so a sea field is a pure function of the map. It lives in a
// transient cache outside the snapshot and is recomputed on demand after a restore.

const seaCache = new WeakMap<World, Map<number, Float32Array>>();

/** Nearest water tile to a point within 8 tiles, or -1. */
export function seaGoal(m: MapDef, x: number, y: number): number {
  const tx = clamp((x / TILE) | 0, 0, m.cols - 1), ty = clamp((y / TILE) | 0, 0, m.rows - 1);
  if (m.tiles[ty * m.cols + tx] === 3) return ty * m.cols + tx;
  let best = -1, bd = Infinity;
  for (let dy = -8; dy <= 8; dy++) {
    const ny = ty + dy;
    if (ny < 0 || ny >= m.rows) continue;
    for (let dx = -8; dx <= 8; dx++) {
      const nx = tx + dx;
      if (nx < 0 || nx >= m.cols) continue;
      if (m.tiles[ny * m.cols + nx] !== 3) continue;
      const d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = ny * m.cols + nx; }
    }
  }
  return best;
}

/** Distance over water to the goal tile, cached per goal. */
export function seaField(w: World, goal: number): Float32Array {
  let c = seaCache.get(w);
  if (!c) { c = new Map(); seaCache.set(w, c); }
  const hit = c.get(goal);
  if (hit) return hit;
  if (c.size > 24) c.clear();
  const m = w.map;
  const f = dijk(m.cols, m.rows, goal, (i) => (m.tiles[i] === 3 ? 1 : Infinity));
  c.set(goal, f);
  return f;
}

/** True when the straight line to (x, y) stays on water until the final approach to shore. */
export function seaClear(m: MapDef, x1: number, y1: number, x2: number, y2: number): boolean {
  const d = Math.hypot(x2 - x1, y2 - y1);
  const n = Math.max(1, Math.ceil(d / 4));
  for (let i = 1; i <= n; i++) {
    const x = x1 + ((x2 - x1) * i) / n, y = y1 + ((y2 - y1) * i) / n;
    const tx = (x / TILE) | 0, ty = (y / TILE) | 0;
    if (tx < 0 || ty < 0 || tx >= m.cols || ty >= m.rows) return false;
    if (m.tiles[ty * m.cols + tx] !== 3) return Math.hypot(x2 - x, y2 - y) <= 10;
  }
  return true;
}

/** Boat direction toward a point: downhill on the sea field of its nearest water tile. Null when
 * the water is open (steer straight), off the water, or on a different sea. */
export function seaDir(w: World, u: Unit, x: number, y: number): [number, number] | null {
  const m = w.map, cols = m.cols;
  if (seaClear(m, u.x, u.y, x, y)) return null;
  const goal = seaGoal(m, x, y);
  if (goal < 0) return null;
  const D = seaField(w, goal);
  const tx = clamp((u.x / TILE) | 0, 0, cols - 1), ty = clamp((u.y / TILE) | 0, 0, m.rows - 1);
  const here = D[ty * cols + tx];
  if (here === Infinity) return null;
  let bx = tx, by = ty, bd = here;
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = tx + dx, ny = ty + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= m.rows) continue;
      if (dx && dy && (m.tiles[ty * cols + nx] !== 3 || m.tiles[ny * cols + tx] !== 3)) continue;
      const d = D[ny * cols + nx];
      if (d < bd) { bd = d; bx = nx; by = ny; }
    }
  if (bd >= here) return null;
  const ddx = bx * TILE + 4 - u.x, ddy = by * TILE + 4 - u.y, dd = Math.hypot(ddx, ddy) || 1;
  return [ddx / dd, ddy / dd];
}

// ---------- ground fields ----------
// Point-to-point walks steer straight and slide, which strands units in concave terrain on
// long trips. Far from its goal a unit follows a distance field instead; the last stretch is
// straight. Fields are cached per (team, goal block) and rebuilt when the flow fields are, so
// new walls and gates are honored. Pure functions of world state: nothing here is saved.

const groundCache = new WeakMap<World, { tick: number; fields: Map<number, Float32Array> }>();

/** Distance over walkable ground to the goal tile, for one team. */
export function groundField(w: World, team: number, gtx: number, gty: number): Float32Array {
  let c = groundCache.get(w);
  if (!c || c.tick !== w.flowTick) { c = { tick: w.flowTick, fields: new Map() }; groundCache.set(w, c); }
  const m = w.map, cols = m.cols;
  const key = (team * m.rows + gty) * cols + gtx;
  const hit = c.fields.get(key);
  if (hit) return hit;
  if (c.fields.size > 48) c.fields.clear();
  // Same walking costs as the home fields: roads cheap, trees slow, buildings block except
  // bridges, traps, and own or open gates.
  const cost = (i: number): number => {
    const t = m.tiles[i];
    const b = w.bmap.get(i);
    if (b && b.kind === 'bridge') return 1;
    if (blocked(t)) return Infinity;
    const base = t === 2 ? 2 : t === 1 ? WORK.roadCost : 1;
    if (!b || b.kind === 'trap') return base;
    if (b.kind === 'gate') return allied(w, b.team, team) || !b.locked ? base : Infinity;
    return Infinity;
  };
  const f = dijk(cols, m.rows, gty * cols + gtx, cost);
  c.fields.set(key, f);
  return f;
}

/** Walk direction along the ground field toward (x, y), or null to steer straight. */
export function groundDir(w: World, u: Unit, x: number, y: number): [number, number] | null {
  const m = w.map, cols = m.cols;
  const D = groundField(w, u.team, clamp((x / TILE) | 0, 0, cols - 1), clamp((y / TILE) | 0, 0, m.rows - 1));
  const tx = clamp((u.x / TILE) | 0, 0, cols - 1), ty = clamp((u.y / TILE) | 0, 0, m.rows - 1);
  const here = D[ty * cols + tx];
  if (here === Infinity) return null;
  let bx = tx, by = ty, bd = here;
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = tx + dx, ny = ty + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= m.rows) continue;
      if (dx && dy && (blocked(m.tiles[ty * cols + nx]) || blocked(m.tiles[ny * cols + tx]))) continue;
      const d = D[ny * cols + nx];
      if (d < bd) { bd = d; bx = nx; by = ny; }
    }
  if (bd >= here) return null;
  const ddx = bx * TILE + 4 - u.x, ddy = by * TILE + 4 - u.y, dd = Math.hypot(ddx, ddy) || 1;
  return [ddx / dd, ddy / dd];
}

// ---------- landmasses ----------

const landCache = new WeakMap<World, { stamp: number; lab: Int32Array }>();

/** Connected-component label of walkable ground; bridges link shores. -1 on water and rock.
 * Cached; a built or lost bridge, or a repainted map, changes the stamp and relabels. */
export function landLabels(w: World): Int32Array {
  let stamp = 0;
  for (const b of w.blds) if (b.kind === 'bridge' && b.hp > 0) stamp += b.tiles.length;
  stamp *= 1000003;
  for (let i = 0; i < w.map.tiles.length; i++) if (blocked(w.map.tiles[i])) stamp += i;
  const hit = landCache.get(w);
  if (hit && hit.stamp === stamp) return hit.lab;
  const m = w.map, cols = m.cols, n = cols * m.rows;
  const walk = new Uint8Array(n);
  for (let i = 0; i < n; i++) walk[i] = blocked(m.tiles[i]) ? 0 : 1;
  for (const b of w.blds) if (b.kind === 'bridge' && b.hp > 0) for (const [tx, ty] of b.tiles) { const i = ty * cols + tx; if (i >= 0 && i < n) walk[i] = 1; }
  const lab = new Int32Array(n).fill(-1);
  const q = new Int32Array(n);
  let next = 0;
  for (let s = 0; s < n; s++) {
    if (!walk[s] || lab[s] >= 0) continue;
    let head = 0, tail = 0;
    q[tail++] = s; lab[s] = next;
    while (head < tail) {
      const cur = q[head++], cx = cur % cols, cy = (cur / cols) | 0;
      if (cx > 0 && walk[cur - 1] && lab[cur - 1] < 0) { lab[cur - 1] = next; q[tail++] = cur - 1; }
      if (cx < cols - 1 && walk[cur + 1] && lab[cur + 1] < 0) { lab[cur + 1] = next; q[tail++] = cur + 1; }
      if (cy > 0 && walk[cur - cols] && lab[cur - cols] < 0) { lab[cur - cols] = next; q[tail++] = cur - cols; }
      if (cy < m.rows - 1 && walk[cur + cols] && lab[cur + cols] < 0) { lab[cur + cols] = next; q[tail++] = cur + cols; }
    }
    next++;
  }
  landCache.set(w, { stamp, lab });
  return lab;
}

/** True when both points stand on the same walkable landmass. */
export function sameLand(w: World, x1: number, y1: number, x2: number, y2: number): boolean {
  const m = w.map, lab = landLabels(w);
  const i1 = clamp((y1 / TILE) | 0, 0, m.rows - 1) * m.cols + clamp((x1 / TILE) | 0, 0, m.cols - 1);
  const i2 = clamp((y2 / TILE) | 0, 0, m.rows - 1) * m.cols + clamp((x2 / TILE) | 0, 0, m.cols - 1);
  return lab[i1] >= 0 && lab[i1] === lab[i2];
}

/** Unit direction along its slot's flow field, or null at a local minimum. */
export function flowDir(w: World, u: Unit): [number, number] | null {
  const m = w.map, cols = m.cols, D = w.flow ? w.flow[u.team] : null;
  if (!D) return null;
  const tx = clamp((u.x / TILE) | 0, 0, cols - 1), ty = clamp((u.y / TILE) | 0, 0, m.rows - 1);
  const here = D[ty * cols + tx];
  let bx = tx, by = ty, bd = here;
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = tx + dx, ny = ty + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= m.rows) continue;
      if (dx && dy && (blocked(m.tiles[ty * cols + nx]) || blocked(m.tiles[ny * cols + tx]))) continue;
      const d = D[ny * cols + nx];
      if (d < bd) { bd = d; bx = nx; by = ny; }
    }
  if (bd >= here) return null;
  const ddx = bx * TILE + 4 - u.x, ddy = by * TILE + 4 - u.y, d = Math.hypot(ddx, ddy) || 1;
  return [ddx / d, ddy / d];
}
