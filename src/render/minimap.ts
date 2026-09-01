// Minimap. Terrain comes from a per-tile average built once per map, so a big world costs the
// same per frame as a small one. Units are dots, the view is a rectangle.

import { frameVision } from './scene.ts';
import { TEAM } from '../data/teams.ts';
import { TILE, type MapDef } from '../sim/map.ts';
import type { World } from '../sim/types.ts';
import type { Camera } from './camera.ts';

const TILE_COLORS = ['#3f7d3f', '#8a6d47', '#2c5a2c', '#2b5f9e', '#6e7280'];

export interface MinimapCache {
  map: MapDef | null;
  img: HTMLCanvasElement;
}

export function makeMinimapCache(): MinimapCache {
  return { map: null, img: document.createElement('canvas') };
}

/** One pixel per tile. Rebuilt only when the map object changes. */
function terrainImage(mc: MinimapCache, m: MapDef): HTMLCanvasElement {
  if (mc.map === m && mc.img.width === m.cols) return mc.img;
  mc.map = m;
  mc.img.width = m.cols;
  mc.img.height = m.rows;
  const c = mc.img.getContext('2d')!;
  for (let ty = 0; ty < m.rows; ty++)
    for (let tx = 0; tx < m.cols; tx++) {
      c.fillStyle = TILE_COLORS[m.tiles[ty * m.cols + tx]] ?? '#000';
      c.fillRect(tx, ty, 1, 1);
    }
  return mc.img;
}

export interface MinimapLayout {
  /** Scale from world pixels to minimap CSS pixels. */
  s: number;
  ox: number;
  oy: number;
}

export function minimapLayout(m: MapDef, size: number): MinimapLayout {
  const W = m.cols * TILE, H = m.rows * TILE;
  const s = Math.min(size / W, size / H);
  return { s, ox: (size - W * s) / 2, oy: (size - H * s) / 2 };
}

export function drawMinimap(cv: HTMLCanvasElement, mc: MinimapCache, m: MapDef, w: World | null, cam: Camera, size: number, dpr: number, viewer = 0): void {
  if (cv.width !== size * dpr) { cv.width = size * dpr; cv.height = size * dpr; cv.style.width = size + 'px'; cv.style.height = size + 'px'; }
  const c = cv.getContext('2d')!;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.imageSmoothingEnabled = false;
  c.fillStyle = '#0a0b10';
  c.fillRect(0, 0, size, size);
  const L = minimapLayout(m, size), img = terrainImage(mc, m);
  c.drawImage(img, L.ox, L.oy, m.cols * TILE * L.s, m.rows * TILE * L.s);
  const dot = Math.max(1.5, 2 * L.s * TILE / 8);
  if (w && w.regionOf) {
    const cols = m.cols;
    for (let ty = 0; ty < m.rows; ty++)
      for (let tx = 0; tx < cols; tx++) {
        const r = w.regions[w.regionOf[ty * cols + tx]];
        if (r.owner < 0) continue;
        c.fillStyle = TEAM[r.owner];
        c.globalAlpha = 0.35;
        c.fillRect(L.ox + tx * TILE * L.s, L.oy + ty * TILE * L.s, TILE * L.s + 0.5, TILE * L.s + 0.5);
      }
    c.globalAlpha = 1;
  }
  if (w) {
    const fog = frameVision(w, viewer), seen = fog ? w.seen : null, cols = m.cols;
    const own = (team: number): boolean => w.slots[team].ally === w.slots[viewer].ally;
    const tileOf = (x: number, y: number): number => ((y / TILE) | 0) * cols + ((x / TILE) | 0);
    const inSight = (x: number, y: number): boolean => !fog || fog[tileOf(x, y)] === 1;
    const known = (x: number, y: number): boolean => !seen || seen[tileOf(x, y)] === 1;
    for (const s of w.slots) for (const b of s.settlements) if (own(b.team) || known(b.x, b.y)) { c.fillStyle = b.hp > 0 ? TEAM[b.team] : '#444'; c.fillRect(L.ox + b.x * L.s - dot, L.oy + b.y * L.s - dot, dot * 2, dot * 2); }
    for (const q of w.mines) if (known(q.x, q.y)) { c.fillStyle = q.owner >= 0 ? TEAM[q.owner] : '#f2d34a'; c.fillRect(L.ox + q.x * L.s - 1, L.oy + q.y * L.s - 1, 2, 2); }
    for (const b of w.blds) if (own(b.team) || known(b.x, b.y)) { c.fillStyle = TEAM[b.team]; c.globalAlpha = 0.6; c.fillRect(L.ox + b.x * L.s - 0.5, L.oy + b.y * L.s - 0.5, 1, 1); c.globalAlpha = 1; }
    for (const u of w.units) if (own(u.team) || inSight(u.x, u.y)) { c.fillStyle = TEAM[u.team]; c.fillRect(L.ox + u.x * L.s - dot / 2, L.oy + u.y * L.s - dot / 2, dot, dot); }
    if (seen) {
      // Unexplored land is dark on the map too.
      c.fillStyle = 'rgba(7,8,12,.85)';
      const ts = TILE * L.s;
      for (let ty = 0; ty < m.rows; ty++) {
        let run = -1;
        for (let tx = 0; tx <= cols; tx++) {
          const on = tx < cols && seen[ty * cols + tx] === 0;
          if (on && run < 0) run = tx;
          else if (!on && run >= 0) { c.fillRect(L.ox + run * ts, L.oy + ty * ts, (tx - run) * ts + 0.5, ts + 0.5); run = -1; }
        }
      }
    }
  } else {
    m.bases.forEach((b, i) => { c.fillStyle = TEAM[i]; c.fillRect(L.ox + (b.tx * TILE + 4) * L.s - dot, L.oy + (b.ty * TILE + 4) * L.s - dot, dot * 2, dot * 2); });
  }
  c.strokeStyle = 'rgba(255,255,255,.8)';
  c.lineWidth = 1;
  c.strokeRect(L.ox + cam.x * L.s + 0.5, L.oy + cam.y * L.s + 0.5, (cam.vw / cam.zoom) * L.s, (cam.vh / cam.zoom) * L.s);
}

/** Minimap CSS point to world pixels. */
export function minimapToWorld(m: MapDef, size: number, mx: number, my: number): { x: number; y: number } {
  const L = minimapLayout(m, size);
  return { x: (mx - L.ox) / L.s, y: (my - L.oy) / L.s };
}
