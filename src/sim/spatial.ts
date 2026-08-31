// Spatial hash over units, rebuilt once per tick. Cells are 16px, twice the largest unit radius
// plus a margin, so a separation query touches at most nine cells.

import type { Unit, World } from './types.ts';

export const CELL = 16;

export interface Grid {
  cols: number;
  rows: number;
  cells: Unit[][];
  /** Indices of cells holding units, so clearing costs units, not map area. */
  used: number[];
}

export function makeGrid(cols: number, rows: number): Grid {
  const gc = Math.ceil((cols * 8) / CELL) + 1, gr = Math.ceil((rows * 8) / CELL) + 1;
  return { cols: gc, rows: gr, cells: Array.from({ length: gc * gr }, () => []), used: [] };
}

/** Fill the grid with every living unit in world order. */
export function fillGrid(g: Grid, units: readonly Unit[]): void {
  const used = g.used;
  for (let i = 0; i < used.length; i++) g.cells[used[i]].length = 0;
  used.length = 0;
  for (let i = 0; i < units.length; i++) {
    const u = units[i];
    if (u.hp <= 0) continue;
    const cx = Math.max(0, Math.min(g.cols - 1, (u.x / CELL) | 0)), cy = Math.max(0, Math.min(g.rows - 1, (u.y / CELL) | 0));
    const idx = cy * g.cols + cx, cell = g.cells[idx];
    if (!cell.length) used.push(idx);
    cell.push(u);
  }
}

/** Visit every unit whose cell overlaps the circle. Callers still check the exact distance. */
export function forNear(g: Grid, x: number, y: number, r: number, fn: (u: Unit) => void): void {
  const x0 = Math.max(0, ((x - r) / CELL) | 0), x1 = Math.min(g.cols - 1, ((x + r) / CELL) | 0);
  const y0 = Math.max(0, ((y - r) / CELL) | 0), y1 = Math.min(g.rows - 1, ((y + r) / CELL) | 0);
  for (let cy = y0; cy <= y1; cy++)
    for (let cx = x0; cx <= x1; cx++) {
      const cell = g.cells[cy * g.cols + cx];
      for (let i = 0; i < cell.length; i++) fn(cell[i]);
    }
}

/**
 * Nearest unit passing `ok`, searched in expanding rings so dense fights resolve in a cell or two.
 * Returns the same answer as a full scan: ties break on world order because cells keep world order
 * and rings are checked from the inside out with an exact distance bound.
 */
export function nearest(g: Grid, x: number, y: number, ok: (u: Unit) => boolean, dist: (u: Unit) => number): { u: Unit | null; d: number } {
  const cx = Math.max(0, Math.min(g.cols - 1, (x / CELL) | 0)), cy = Math.max(0, Math.min(g.rows - 1, (y / CELL) | 0));
  const maxR = Math.max(g.cols, g.rows);
  let best: Unit | null = null, bd = Infinity;
  for (let ring = 0; ring <= maxR; ring++) {
    // Anything in this ring is at least (ring - 1) * CELL away. Stop once that cannot beat the best.
    if (best && (ring - 1) * CELL > bd) break;
    const x0 = cx - ring, x1 = cx + ring, y0 = cy - ring, y1 = cy + ring;
    if (x0 < 0 && y0 < 0 && x1 >= g.cols && y1 >= g.rows) break;
    for (let yy = y0; yy <= y1; yy++) {
      if (yy < 0 || yy >= g.rows) continue;
      const edge = yy === y0 || yy === y1;
      for (let xx = x0; xx <= x1; xx += edge ? 1 : x1 - x0 || 1) {
        if (xx < 0 || xx >= g.cols) continue;
        const cell = g.cells[yy * g.cols + xx];
        for (let i = 0; i < cell.length; i++) {
          const u = cell[i];
          if (!ok(u)) continue;
          const d = dist(u);
          if (d < bd) { bd = d; best = u; }
        }
        if (!edge && x1 === x0) break;
      }
    }
  }
  return { u: best, d: bd };
}

/**
 * Nearest unit within `R` of a point among units hostile to `ally` (by alliance id), skipping
 * `self` and hidden units. Exact: only a hit inside R counts, so callers fall back to a full scan
 * of their hostile list when this returns null. No closures, this runs for every unit every tick.
 */
export function nearestHostileWithin(g: Grid, x: number, y: number, R: number, hostile: readonly boolean[], self: Unit | null, visible: (u: Unit) => boolean): { u: Unit | null; d2: number } {
  const x0 = Math.max(0, ((x - R) / CELL) | 0), x1 = Math.min(g.cols - 1, ((x + R) / CELL) | 0);
  const y0 = Math.max(0, ((y - R) / CELL) | 0), y1 = Math.min(g.rows - 1, ((y + R) / CELL) | 0);
  let best: Unit | null = null, bd = R * R;
  for (let cy = y0; cy <= y1; cy++)
    for (let cx = x0; cx <= x1; cx++) {
      const cell = g.cells[cy * g.cols + cx];
      for (let i = 0; i < cell.length; i++) {
        const o = cell[i];
        if (o === self || o.hp <= 0 || !hostile[o.team]) continue;
        const dx = o.x - x, dy = o.y - y, d2 = dx * dx + dy * dy;
        if (d2 < bd && visible(o)) { bd = d2; best = o; }
      }
    }
  return { u: best, d2: bd };
}

/** Grid for this world, created on first use and kept on the world (not part of snapshots). */
export function gridOf(w: World): Grid {
  const g = w.grid as Grid | null;
  if (g && g.cols === Math.ceil((w.map.cols * 8) / CELL) + 1 && g.rows === Math.ceil((w.map.rows * 8) / CELL) + 1) return g;
  const n = makeGrid(w.map.cols, w.map.rows);
  w.grid = n;
  return n;
}
