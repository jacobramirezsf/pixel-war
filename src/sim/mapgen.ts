// Procedural map generation and multi-slot base placement.

import { blankMap, blocked, clearArea, finishMap, type MapDef } from './map.ts';
import { distField, connected } from './pathing.ts';
import { rand, rnd, type Rng } from './rng.ts';

/** Deterministic hash in [0, 1). Also used by terrain rendering for tile variation. */
export function hash(x: number, y: number): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function noise(x: number, y: number, seed: number, sc: number): number {
  const gx = x / sc, gy = y / sc, x0 = Math.floor(gx), y0 = Math.floor(gy), fx = gx - x0, fy = gy - y0;
  const h = (a: number, b: number): number => hash(a * 31 + seed, b * 17 + seed * 7);
  return h(x0, y0) * (1 - fx) * (1 - fy) + h(x0 + 1, y0) * fx * (1 - fy) + h(x0, y0 + 1) * (1 - fx) * fy + h(x0 + 1, y0 + 1) * fx * fy;
}

export interface GenOpts {
  name: string;
  cols: number;
  rows: number;
  seed: number;
  road: boolean;
  tree: number;
  rock: number;
  water: number;
  river?: boolean;
  mines: [number, number][];
}

/** Symmetric map: the top half is generated, the bottom half is its point mirror. */
export function gen(o: GenOpts): MapDef {
  const m = blankMap(o.name, o.cols, o.rows), { cols, rows, tiles } = m, half = Math.ceil(rows / 2), rc = (cols >> 1) - 2;
  for (let y = 0; y < half; y++)
    for (let x = 0; x < cols; x++) {
      let t = 0;
      const nw = noise(x, y, o.seed, 5), nt = noise(x + 40, y + 40, o.seed + 3, 3.5), nr = hash(x * 7 + o.seed, y * 13 + o.seed);
      if (o.tree && nt > 0.78 - 0.25 * o.tree) t = 2;
      if (o.rock && nr > 1 - 0.05 * o.rock) t = 4;
      if (o.water && nw > 0.82 - 0.22 * o.water) t = 3;
      if (o.road && x >= rc && x < rc + 4) t = 1;
      tiles[y * cols + x] = t;
    }
  for (let y = 0; y < half; y++) for (let x = 0; x < cols; x++) tiles[(rows - 1 - y) * cols + x] = tiles[y * cols + x];
  if (o.river) {
    const r0 = Math.floor((rows - 1) / 2) - (rows % 2 ? 1 : 0), r1 = Math.ceil((rows - 1) / 2) + (rows % 2 ? 1 : 0);
    for (let y = r0; y <= r1; y++)
      for (let x = 0; x < cols; x++) {
        let t = 3;
        if (x <= 3 || x >= cols - 4) t = 0;
        if (o.road && x >= rc && x < rc + 4) t = 1;
        tiles[y * cols + x] = t;
      }
  }
  for (const [tx, ty] of o.mines) m.mines.push({ tx, ty });
  return finishMap(m);
}

export function islands(): MapDef {
  const m = blankMap('Islands', 25, 35), { cols, rows, tiles } = m;
  tiles.fill(3);
  const land = (x0: number, y0: number, x1: number, y1: number, t: number): void => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (x >= 0 && y >= 0 && x < cols && y < rows) tiles[y * cols + x] = t;
  };
  land(0, 0, cols - 1, 6, 0); land(0, rows - 7, cols - 1, rows - 1, 0); land(8, 14, 16, 20, 0);
  land(2, 0, 3, rows - 1, 0); land(cols - 4, 0, cols - 3, rows - 1, 0);
  land(11, 7, 13, 13, 1); land(11, 21, 13, 27, 1);
  for (let i = 0; i < cols * rows; i++) {
    const x = i % cols, y = (i / cols) | 0;
    if (tiles[i] === 0 && hash(x + 9, y + 9) > 0.9) tiles[i] = 2;
  }
  m.mines = [{ tx: 12, ty: 17 }, { tx: 2, ty: 17 }, { tx: 22, ty: 17 }];
  return finishMap(m);
}

/** Random symmetric map. Falls back to a blank map after 12 disconnected tries. */
export function randomMap(cols: number, rows: number, rng: Rng): MapDef {
  for (let tries = 0; tries < 12; tries++) {
    const m = gen({
      name: 'Custom', cols, rows, seed: (rand(rng) * 1e6) | 0,
      road: rand(rng) < 0.7, tree: rnd(rng, 0.2, 1), rock: rnd(rng, 0, 0.8),
      water: rand(rng) < 0.5 ? rnd(rng, 0.3, 1) : 0, river: rand(rng) < 0.35, mines: [],
    });
    const n = rand(rng) < 0.5 ? 2 : 4, x = 2 + ((rand(rng) * 3) | 0), y = 4 + ((rand(rng) * (rows / 2 - 6)) | 0);
    m.mines.push({ tx: x, ty: y }, { tx: cols - 1 - x, ty: rows - 1 - y });
    if (n === 4) m.mines.push({ tx: cols - 1 - x, ty: y }, { tx: x, ty: rows - 1 - y });
    finishMap(m);
    if (!connected(m)) continue;
    const d = distField(m, m.bases[0].tx, m.bases[0].ty);
    m.mines = m.mines.filter((q) => d[q.ty * m.cols + q.tx] < Infinity);
    return m;
  }
  return blankMap('Custom', cols, rows);
}

function carve(m: MapDef, x0: number, y0: number, x1: number, y1: number): void {
  let x = x0, y = y0;
  while (x !== x1) { x += Math.sign(x1 - x); if (blocked(m.tiles[y * m.cols + x])) m.tiles[y * m.cols + x] = 1; }
  while (y !== y1) { y += Math.sign(y1 - y); if (blocked(m.tiles[y * m.cols + x])) m.tiles[y * m.cols + x] = 1; }
}

/** Place nP bases on an ellipse and carve corridors so every base can reach base 0. */
export function mkBases(m: MapDef, nP: number): MapDef {
  if (nP <= 2) return m;
  const cx = (m.cols - 1) / 2, cy = (m.rows - 1) / 2, rx = cx - 2.5, ry = cy - 2.5;
  m.bases = [];
  for (let i = 0; i < nP; i++) {
    const a = Math.PI / 2 + (i * 2 * Math.PI) / nP;
    m.bases.push({ tx: Math.round(cx + rx * Math.cos(a)), ty: Math.round(cy + ry * Math.sin(a)) });
  }
  for (const b of m.bases) clearArea(m, b.tx, b.ty, 5, 4);
  finishMap(m);
  const ctx0 = Math.round(cx), cty0 = Math.round(cy);
  for (let pass = 0; pass < 3; pass++) {
    const d = distField(m, m.bases[0].tx, m.bases[0].ty);
    let bad = false;
    for (let i = 0; i < nP; i++) {
      const b = m.bases[i];
      if (d[b.ty * m.cols + b.tx] === Infinity) { bad = true; carve(m, b.tx, b.ty, ctx0, cty0); }
    }
    if (!bad) break;
    carve(m, m.bases[0].tx, m.bases[0].ty, ctx0, cty0);
    finishMap(m);
  }
  return m;
}
