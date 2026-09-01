// Realm worlds. Asymmetric, readable geography: forest belts, rock ridges with passes,
// a river or two with fords, cleared town sites, and a guaranteed route between every region.

import { blankMap, blocked, clearArea, finishMap, type MapDef } from './map.ts';
import { hash, noise } from './mapgen.ts';
import { distField } from './pathing.ts';
import { makeRng, rand, randInt, type Rng } from './rng.ts';
import type { Region } from './types.ts';

export interface RealmGen {
  map: MapDef;
  grid: number;
  /** Tiles per region side. */
  cell: number;
}

const T = { grass: 0, road: 1, tree: 2, water: 3, rock: 4 } as const;

function carveRiver(m: MapDef, rng: Rng, vertical: boolean): void {
  const { cols, rows, tiles } = m;
  const len = vertical ? rows : cols, span = vertical ? cols : rows;
  let p = span * (0.3 + rand(rng) * 0.4), drift = 0, ford = 6 + randInt(rng, 6);
  const wide = rand(rng) < 0.5 ? 2 : 1;
  for (let i = 0; i < len; i++) {
    drift += (rand(rng) - 0.5) * 0.9;
    drift = Math.max(-1, Math.min(1, drift));
    p += drift;
    p = Math.max(3, Math.min(span - 4, p));
    const c = Math.round(p);
    const isFord = --ford <= 0;
    if (isFord) ford = 9 + randInt(rng, 6);
    for (let k = 0; k < wide; k++) {
      const q = c + k;
      const idx = vertical ? i * cols + q : q * cols + i;
      // Fords are two tiles of road across the water so the crossing reads on the map.
      tiles[idx] = isFord ? T.road : T.water;
      if (isFord) { const j = vertical ? (i + 1) * cols + q : q * cols + i + 1; if (j < tiles.length) tiles[j] = T.road; }
    }
  }
}

/** Long winding rock lines from a noise band, broken by passes. */
function ridges(m: MapDef, seed: number, amount: number): void {
  const { cols, rows, tiles } = m;
  for (let y = 2; y < rows - 2; y++)
    for (let x = 2; x < cols - 2; x++) {
      const n = noise(x + 200, y + 200, seed + 11, 9);
      const band = Math.abs(n - 0.5) < 0.022 * amount;
      if (!band) continue;
      // A pass every so often.
      if (hash(x * 3 + seed, y * 5 + seed) > 0.86) continue;
      const i = y * cols + x;
      if (tiles[i] === T.grass || tiles[i] === T.tree) tiles[i] = T.rock;
    }
}

export function realmMap(seed: number, grid: number, rivals: number): RealmGen {
  const cell = grid >= 7 ? 20 : grid >= 5 ? 18 : 16;
  const cols = grid * cell, rows = grid * cell;
  const m = blankMap('Realm', cols, rows);
  const rng = makeRng(seed ^ 0x2545f491);
  const { tiles } = m;
  // Forests in belts, a few lakes.
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      const f = noise(x, y, seed, 6.5), l = noise(x + 90, y + 30, seed + 5, 8);
      let t: number = T.grass;
      if (f > 0.6) t = T.tree;
      if (l > 0.84) t = T.water;
      tiles[y * cols + x] = t;
    }
  ridges(m, seed, grid >= 4 ? 1.1 : 0.9);
  // Rivers: one on small worlds, two on larger ones, crossing the map with fords.
  carveRiver(m, rng, rand(rng) < 0.5);
  if (grid >= 4) carveRiver(m, rng, rand(rng) < 0.5);
  for (let k = 5; k <= grid; k += 2) carveRiver(m, rng, rand(rng) < 0.5);
  // Capitals: corners, then the middle of the top edge for a fifth kingdom.
  const e = 5;
  const corners = [{ tx: e, ty: rows - 1 - e }, { tx: cols - 1 - e, ty: e }, { tx: e, ty: e }, { tx: cols - 1 - e, ty: rows - 1 - e }, { tx: cols >> 1, ty: 4 }];
  m.bases = corners.slice(0, rivals + 1);
  for (const b of m.bases) clearArea(m, b.tx, b.ty, 6, 5);
  finishMap(m);
  return { map: m, grid, cell };
}

/** After regions exist: clear each town site, drop a mine per region, and connect everything to the first capital. */
export function shapeRealm(m: MapDef, regions: Region[], rng: Rng, capitals: { tx: number; ty: number }[]): void {
  const { cols, rows, tiles } = m;
  const TILE = 8;
  for (const r of regions) {
    const tx = Math.round(r.cx / TILE), ty = Math.round(r.cy / TILE);
    clearArea(m, tx, ty, 5, 4);
    // A mine somewhere in the region, away from the center, on open ground.
    for (let t = 0; t < 20; t++) {
      const a = rand(rng) * Math.PI * 2, d = 5 + rand(rng) * 4;
      const mx = Math.round(tx + Math.cos(a) * d), my = Math.round(ty + Math.sin(a) * d);
      if (mx < 2 || my < 2 || mx >= cols - 2 || my >= rows - 2) continue;
      if (tiles[my * cols + mx] !== T.grass) continue;
      if (capitals.some((c) => Math.abs(c.tx - mx) <= 3 && Math.abs(c.ty - my) <= 2)) continue;
      m.mines.push({ tx: mx, ty: my });
      clearArea(m, mx, my, 1, 1);
      break;
    }
  }
  // Connectivity: every region center reachable from the first capital. Carve a corridor to the nearest reachable center otherwise.
  const centers = regions.map((r) => ({ tx: Math.round(r.cx / TILE), ty: Math.round(r.cy / TILE) }));
  for (let guard = 0; guard < regions.length; guard++) {
    const d = distField(m, capitals[0].tx, capitals[0].ty);
    const reach = (p: { tx: number; ty: number }): boolean => d[p.ty * cols + p.tx] < Infinity;
    const bad = centers.findIndex((c) => !reach(c));
    if (bad < 0) break;
    const ok = centers.filter(reach);
    const from = centers[bad];
    let to = capitals[0], bd = Infinity;
    for (const c of ok) { const dd = Math.hypot(c.tx - from.tx, c.ty - from.ty); if (dd < bd) { bd = dd; to = c; } }
    const n = Math.max(1, Math.ceil(bd));
    for (let i = 0; i <= n; i++) {
      const x = Math.round(from.tx + ((to.tx - from.tx) * i) / n), y = Math.round(from.ty + ((to.ty - from.ty) * i) / n);
      for (let dy = 0; dy <= 1; dy++) for (let dx = 0; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= cols || yy >= rows) continue;
        const i2 = yy * cols + xx;
        // Water becomes a ford, rock a pass.
        if (tiles[i2] === T.water) tiles[i2] = T.road;
        else if (blocked(tiles[i2])) tiles[i2] = T.grass;
      }
    }
  }
}
