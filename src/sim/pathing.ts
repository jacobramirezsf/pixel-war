// Dijkstra distance fields and flow-field movement.

import { blocked, TILE, clamp, type MapDef } from './map.ts';
import type { Unit, World } from './types.ts';
import { allied } from './world.ts';

type CostFn = (i: number) => number;

export function dijk(cols: number, rows: number, starts: number | number[], costFn: CostFn): Float32Array {
  const dist = new Float32Array(cols * rows).fill(Infinity);
  const h: [number, number][] = [];
  const push = (k: number, n: number): void => {
    h.push([k, n]);
    let i = h.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (h[p][0] <= h[i][0]) break;
      const t = h[p]; h[p] = h[i]; h[i] = t; i = p;
    }
  };
  const pop = (): [number, number] => {
    const top = h[0], last = h.pop()!;
    if (h.length) {
      h[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < h.length && h[l][0] < h[m][0]) m = l;
        if (r < h.length && h[r][0] < h[m][0]) m = r;
        if (m === i) break;
        const t = h[m]; h[m] = h[i]; h[i] = t; i = m;
      }
    }
    return top;
  };
  for (const s of Array.isArray(starts) ? starts : [starts]) { dist[s] = 0; push(0, s); }
  while (h.length) {
    const [k, cur] = pop();
    if (k > dist[cur]) continue;
    const cx = cur % cols, cy = (cur / cols) | 0;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const ni = ny * cols + nx, c = costFn(ni);
        if (c === Infinity) continue;
        if (dx && dy && (costFn(cy * cols + nx) === Infinity || costFn(ny * cols + cx) === Infinity)) continue;
        const nd = dist[cur] + c * (dx && dy ? 1.414 : 1);
        if (nd < dist[ni]) { dist[ni] = nd; push(nd, ni); }
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
    if (blocked(t)) return Infinity;
    const c = t === 2 ? 2 : 1;
    const b = w.bmap.get(i);
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
    if (blocked(t)) return Infinity;
    const c = t === 2 ? 2 : 1;
    const b = w.bmap.get(i);
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
