// Draws a world, or a map in the editor, onto the game canvas at 1 world pixel per canvas pixel.

import { TEAM } from '../data/teams.ts';
import { TYPES, unitVisible } from '../data/units.ts';
import { TILE, type MapDef } from '../sim/map.ts';
import { BLD } from '../data/buildings.ts';
import type { Building, Mine, Settlement, World } from '../sim/types.ts';
import { emptyTown, BASE_HP, mapH } from '../sim/world.ts';
import { computeVision } from '../sim/vision.ts';
import { WORK } from '../data/buildings.ts';
import { maxHp, rank } from '../sim/units.ts';
import { drawBldSpr, drawSprite } from './atlas.ts';
import { snapped, type Camera } from './camera.ts';
import { drawFx } from './fx.ts';

export interface DragRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function drawBase(ctx: CanvasRenderingContext2D, b: Settlement, H: number, capital = false): void {
  const x = b.x - 12, y = b.y - 8;
  if (b.tier === 'ruin') {
    ctx.fillStyle = '#5a5d6a'; ctx.fillRect(x + 2, y + 8, 6, 8); ctx.fillRect(x + 14, y + 4, 4, 12); ctx.fillRect(x + 8, y + 12, 12, 4);
    ctx.fillStyle = '#8a8f9c'; ctx.fillRect(x + 2, y + 8, 6, 1); ctx.fillRect(x + 14, y + 4, 4, 1);
    if (b.nT > 0) { ctx.fillStyle = '#f2d34a'; ctx.fillRect(x, y - 3, Math.round((24 * b.nT) / 5), 2); }
    return;
  }
  if (b.tier === 'camp') {
    ctx.fillStyle = '#5b3d1e'; ctx.fillRect(x + 2, y + 6, 20, 10);
    ctx.fillStyle = '#8a5a2b'; ctx.fillRect(x + 4, y + 2, 16, 5);
    ctx.fillStyle = '#ff8c2a'; ctx.fillRect(x + 10, y + 10, 4, 4);
    ctx.fillStyle = '#c0392b'; ctx.fillRect(x + 20, y - 4, 4, 3); ctx.fillStyle = '#dde2ec'; ctx.fillRect(x + 19, y - 4, 1, 8);
    ctx.fillStyle = '#111'; ctx.fillRect(x, y - 9, 24, 2);
    ctx.fillStyle = '#c0392b'; ctx.fillRect(x, y - 9, Math.round((24 * b.hp) / b.max), 2);
    return;
  }
  if (b.tier === 'outpost' && b.hp > 0) {
    ctx.fillStyle = '#5b3d1e'; ctx.fillRect(x + 6, y + 2, 12, 14);
    ctx.fillStyle = '#8a5a2b'; ctx.fillRect(x + 6, y + 2, 12, 2);
    ctx.fillStyle = TEAM[b.team]; ctx.fillRect(x + 17, y - 4, 4, 3); ctx.fillStyle = '#dde2ec'; ctx.fillRect(x + 16, y - 4, 1, 8);
    ctx.fillStyle = '#111'; ctx.fillRect(x, y - 9, 24, 2);
    ctx.fillStyle = TEAM[b.team]; ctx.fillRect(x, y - 9, Math.round((24 * b.hp) / b.max), 2);
    if (b.buildT > 0) { ctx.fillStyle = '#f2d34a'; ctx.fillRect(x, y - 12, 24, 1); }
    return;
  }
  if (b.tier === 'town' && b.hp > 0) {
    // A town: the hall gains a wing on each side and a taller roof.
    ctx.fillStyle = '#4f5464'; ctx.fillRect(x - 5, y + 5, 6, 11); ctx.fillRect(x + 23, y + 5, 6, 11);
    ctx.fillStyle = '#6e7480'; ctx.fillRect(x - 5, y + 5, 6, 1); ctx.fillRect(x + 23, y + 5, 6, 1);
    ctx.fillStyle = '#3a3f4e'; ctx.fillRect(x - 3, y + 9, 2, 2); ctx.fillRect(x + 25, y + 9, 2, 2);
    ctx.fillStyle = '#7a8093'; ctx.fillRect(x + 4, y - 3, 16, 3);
  }
  if ((b.tier === 'fortress' || b.tier === 'city') && b.hp > 0) {
    // A fortress gets a second story and corner towers. A city stands taller again, in pale stone with a gold roof.
    const city = b.tier === 'city';
    ctx.fillStyle = city ? '#5a6070' : '#4a4f5e'; ctx.fillRect(x - 5, y - 4, 34, 22);
    ctx.fillStyle = city ? '#8a90a0' : '#6e7480'; ctx.fillRect(x - 5, y - 6, 5, 8); ctx.fillRect(x + 24, y - 6, 5, 8); ctx.fillRect(x - 5, y + 12, 5, 6); ctx.fillRect(x + 24, y + 12, 5, 6);
    if (city) {
      ctx.fillStyle = '#9aa0ae'; ctx.fillRect(x + 1, y - 9, 22, 6);
      ctx.fillStyle = '#b9bccb'; ctx.fillRect(x + 4, y - 12, 16, 3);
      ctx.fillStyle = '#f2d34a'; ctx.fillRect(x + 9, y - 14, 6, 2); ctx.fillRect(x + 11, y - 16, 2, 2);
      ctx.fillStyle = '#2c2f3a'; for (let i = -3; i < 27; i += 5) ctx.fillRect(x + i, y - 2, 2, 3);
    }
  }
  if (b.hp <= 0) {
    ctx.fillStyle = '#2c2f3a'; ctx.fillRect(x, y + 6, 24, 10);
    ctx.fillStyle = '#454a5a'; ctx.fillRect(x + 2, y + 4, 6, 4); ctx.fillRect(x + 14, y + 3, 7, 5);
    ctx.fillStyle = '#141520'; ctx.fillRect(x + 9, y + 8, 5, 4);
    return;
  }
  ctx.fillStyle = '#5f6474'; ctx.fillRect(x, y + 2, 24, 14);
  ctx.fillStyle = '#454a5a'; for (let i = 0; i < 24; i += 4) ctx.fillRect(x + i, y, 2, 3);
  if (b.buildT <= 0 && b.hp < b.max * 0.6) drawDamage(ctx, x, y + 2, 24, 14, b.hp / b.max, b.id);
  ctx.fillStyle = '#7a8093'; ctx.fillRect(x, y + 3, 24, 1);
  ctx.fillStyle = '#3a3f4e'; ctx.fillRect(x + 3, y + 6, 2, 2); ctx.fillRect(x + 19, y + 6, 2, 2);
  ctx.fillStyle = '#141520'; ctx.fillRect(b.x - 2, b.y < H / 2 ? y + 2 : y + 9, 4, 7);
  ctx.fillStyle = '#dde2ec'; ctx.fillRect(x + 21, y - 5, 1, 7);
  ctx.fillStyle = TEAM[b.team]; ctx.fillRect(x + 22, y - 5, 3, 3);
  if (capital) {
    // The crown: a taller gold standard on the left.
    ctx.fillStyle = '#dde2ec'; ctx.fillRect(x + 1, y - 9, 1, 11);
    ctx.fillStyle = '#f2d34a'; ctx.fillRect(x + 2, y - 9, 5, 3); ctx.fillRect(x + 2, y - 11, 1, 2); ctx.fillRect(x + 4, y - 11, 1, 2); ctx.fillRect(x + 6, y - 11, 1, 2);
  }
  ctx.fillStyle = '#111'; ctx.fillRect(x, y - 9, 24, 2);
  ctx.fillStyle = TEAM[b.team]; ctx.fillRect(x, y - 9, Math.round((24 * b.hp) / b.max), 2);
  if (b.buildT > 0) {
    // Scaffold while building or upgrading.
    ctx.fillStyle = 'rgba(242,211,74,.75)';
    for (let i = 0; i < 24; i += 6) ctx.fillRect(x + i, y + 2, 1, 14);
    ctx.fillStyle = '#f2d34a'; ctx.fillRect(x, y - 12, 24, 1);
  }
}

function drawMine(ctx: CanvasRenderingContext2D, m: Mine): void {
  ctx.fillStyle = '#4e4e58'; ctx.fillRect(m.x - 5, m.y - 3, 10, 7);
  ctx.fillStyle = '#6a6a76'; ctx.fillRect(m.x - 4, m.y - 4, 8, 2);
  ctx.fillStyle = '#f2d34a'; ctx.fillRect(m.x - 3, m.y - 1, 1, 1); ctx.fillRect(m.x + 1, m.y, 1, 1); ctx.fillRect(m.x - 1, m.y + 2, 1, 1);
  ctx.fillStyle = '#dde2ec'; ctx.fillRect(m.x + 5, m.y - 10, 1, 8);
  ctx.fillStyle = m.owner < 0 ? '#8a8a94' : TEAM[m.owner]; ctx.fillRect(m.x + 6, m.y - 10, 4, 3);
}

function drawGate(ctx: CanvasRenderingContext2D, b: Building): void {
  const f = (c: string, x: number, y: number, w: number, h: number): void => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
  const x = b.tx * TILE, y = b.ty * TILE, hz = b.dir === 'h', w = hz ? 16 : 8, h = hz ? 8 : 16;
  f('#5f6474', x, y, hz ? 2 : w, hz ? h : 2);
  f('#5f6474', hz ? x + w - 2 : x, hz ? y : y + h - 2, hz ? 2 : w, hz ? h : 2);
  if (b.locked) {
    f('#8a5a2b', hz ? x + 2 : x, hz ? y : y + 2, hz ? 12 : 8, hz ? 8 : 12);
    if (hz) { f('#5b3d1e', x + 2, y + 2, 12, 1); f('#5b3d1e', x + 2, y + 5, 12, 1); f('#3a2a14', x + 8, y, 1, 8); }
    else { f('#5b3d1e', x + 2, y + 2, 1, 12); f('#5b3d1e', x + 5, y + 2, 1, 12); f('#3a2a14', x, y + 8, 8, 1); }
    f('#f2d34a', b.x - 1, b.y - 1, 2, 2);
  } else {
    if (hz) { f('#8a5a2b', x + 2, y, 2, 8); f('#8a5a2b', x + 12, y, 2, 8); f('#454a5a', x + 2, y, 12, 1); }
    else { f('#8a5a2b', x, y + 2, 8, 2); f('#8a5a2b', x, y + 12, 8, 2); f('#454a5a', x, y + 2, 1, 12); }
  }
  f(TEAM[b.team], x, y, 2, 2);
}

/** Cracks below 60% health, soot and a smoke pixel below 30%. Positions hang off the id so they hold still. */
function drawDamage(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, frac: number, id: number): void {
  const n = frac < 0.3 ? 5 : 3;
  ctx.fillStyle = '#141520';
  for (let i = 0; i < n; i++) {
    const px = x + 1 + ((id * 7 + i * 13) % Math.max(1, w - 3)), py = y + 1 + ((id * 11 + i * 5) % Math.max(1, h - 3));
    ctx.fillRect(px, py, 2, 1); ctx.fillRect(px + 1, py + 1, 1, 2);
  }
  if (frac < 0.3) {
    ctx.fillStyle = 'rgba(20,21,32,.45)'; ctx.fillRect(x, y + h - 3, w, 3);
    ctx.fillStyle = 'rgba(200,200,210,.5)'; ctx.fillRect(x + (w >> 1) - 1, y - 3, 2, 2); ctx.fillRect(x + (w >> 1), y - 5, 1, 2);
  }
}

function drawBld(ctx: CanvasRenderingContext2D, b: Building): void {
  if (b.kind === 'gate') {
    drawGate(ctx, b);
    if (b.hp < b.max) {
      const x = b.tx * TILE, y = b.ty * TILE, w = b.dir === 'h' ? 16 : 8;
      ctx.fillStyle = '#111'; ctx.fillRect(x, y - 3, w, 2);
      ctx.fillStyle = TEAM[b.team]; ctx.fillRect(x, y - 3, Math.max(1, Math.round((w * b.hp) / b.max)), 2);
    }
    return;
  }
  const x = b.tx * TILE, y = b.ty * TILE, D = BLD[b.type], W = D.w * TILE, Hh = D.h * TILE;
  drawBldSpr(ctx, b.type, b.team, x, y, 1);
  if (b.buildT <= 0 && b.hp < b.max * 0.6) drawDamage(ctx, x, y, W, Hh, b.hp / b.max, b.id);
  if (b.buildT > 0) {
    // Scaffold and a progress line while under construction.
    const total = D.buildT ?? 1;
    ctx.fillStyle = 'rgba(242,211,74,.6)';
    for (let i = 0; i < W; i += 4) ctx.fillRect(x + i, y, 1, D.h * TILE);
    ctx.fillStyle = '#111'; ctx.fillRect(x, y - 5, W, 2);
    ctx.fillStyle = '#f2d34a'; ctx.fillRect(x, y - 5, Math.round(W * (1 - b.buildT / total)), 2);
  } else if (b.hp < b.max) {
    const by = b.kind === 'tower' && D.w === 1 ? y - 8 : y - 3;
    ctx.fillStyle = '#111'; ctx.fillRect(x, by, W, 2);
    ctx.fillStyle = TEAM[b.team]; ctx.fillRect(x, by, Math.max(1, Math.round((W * b.hp) / b.max)), 2);
  }
  if (b.queue.length) { ctx.fillStyle = '#7dff7d'; ctx.fillRect(x + W - 3, y - 3, 3, 2); }
  // Level chevrons on the left shoulder.
  if (b.level > 1) { ctx.fillStyle = '#f2d34a'; for (let i = 1; i < b.level; i++) { ctx.fillRect(x + 1, y - 2 - i * 2, 3, 1); ctx.fillRect(x + 2, y - 3 - i * 2, 1, 1); } }
}

/** Set the world transform and clear the viewport. Returns the visible world rect. */
function beginView(ctx: CanvasRenderingContext2D, cam: Camera, dpr: number, shake = { x: 0, y: 0 }): { x0: number; y0: number; x1: number; y1: number } {
  const z = cam.zoom * dpr, o = { x: snapped(cam).x + shake.x, y: snapped(cam).y + shake.y };
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, cam.vw * dpr, cam.vh * dpr);
  ctx.setTransform(z, 0, 0, z, -o.x * z, -o.y * z);
  ctx.imageSmoothingEnabled = false;
  ctx.lineWidth = 1;
  return { x0: o.x, y0: o.y, x1: o.x + cam.vw / cam.zoom, y1: o.y + cam.vh / cam.zoom };
}

/** The map editor view: terrain, a tile grid, mines, and bases. */
export function drawEditor(ctx: CanvasRenderingContext2D, bg: HTMLCanvasElement, m: MapDef, cam: Camera, dpr: number): void {
  beginView(ctx, cam, dpr);
  ctx.drawImage(bg, 0, 0);
  const W = m.cols * TILE, H = m.rows * TILE;
  ctx.strokeStyle = 'rgba(255,255,255,.08)';
  ctx.beginPath();
  for (let x = TILE; x < W; x += TILE) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); }
  for (let y = TILE; y < H; y += TILE) { ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); }
  ctx.stroke();
  for (const q of m.mines) drawMine(ctx, { x: q.tx * TILE + 4, y: q.ty * TILE + 4, owner: -1, prev: -1 });
  m.bases.forEach((b, i) => drawBase(ctx, { ent: 'base', id: 0, team: i, x: b.tx * TILE + 4, y: b.ty * TILE + 4, hp: BASE_HP, max: BASE_HP, cd: 0, tier: 'village', region: -1, buildT: 0, hitBy: -1, nT: 0, civ: emptyTown() }, H));
}

export interface ViewState {
  drag: DragRect | null;
  /** 0..1 position between the previous tick and the current one. */
  alpha: number;
  selection: ReadonlySet<number>;
  paused: boolean;
  /** Slot whose point of view this is. Hidden enemy shades are not drawn. */
  viewer: number;
  /** Unit under the mouse, for hover feedback. */
  hover: number | null;
  cam: Camera;
  dpr: number;
  /** Territory tint, borders, region names, and state tags. */
  layers: { territory: boolean; borders: boolean; names: boolean; tags: boolean };
  damageNumbers: boolean;
  /** Screen shake offset in world pixels. */
  shake: { x: number; y: number };
  /** Power radius preview under the pointer. */
  ghost: { x: number; y: number; r: number } | null;
  /** Building footprint preview: top-left tile, size, and whether it fits. */
  place: { tx: number; ty: number; w: number; h: number; ok: boolean } | null;
}

let tintCanvas: HTMLCanvasElement | null = null, tintKey = '';

/** Ownership tint, cached until ownership or connection changes. */
function tintLayer(w: World, fill = true, borders = true): HTMLCanvasElement | null {
  if (!w.regionOf) return null;
  const key = w.regions.map((r) => r.owner + (r.connected ? '' : '!') + (r.contested ? '?' : '') + (r.garrison < r.need ? '-' : '')).join(',') + '/' + w.map.cols + 'x' + w.map.rows + (fill ? 'f' : '') + (borders ? 'b' : '');
  if (tintCanvas && key === tintKey) return tintCanvas;
  tintKey = key;
  const c = tintCanvas ?? document.createElement('canvas');
  tintCanvas = c;
  c.width = w.map.cols * TILE; c.height = w.map.rows * TILE;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, c.width, c.height);
  const cols = w.map.cols;
  for (let ty = 0; ty < w.map.rows; ty++)
    for (let tx = 0; tx < cols; tx++) {
      const r = w.regions[w.regionOf[ty * cols + tx]];
      if (r.owner < 0 && !r.contested) continue;
      if (!fill && !r.contested) continue;
      g.fillStyle = r.owner >= 0 ? TEAM[r.owner] : '#ffffff';
      g.globalAlpha = r.contested ? ((tx + ty) % 2 ? 0.28 : 0.08) : r.connected ? 0.16 : 0.08;
      g.fillRect(tx * TILE, ty * TILE, TILE, TILE);
    }
  g.globalAlpha = 1;
  // Borders between regions.
  g.fillStyle = 'rgba(255,255,255,.22)';
  if (borders) for (let ty = 0; ty < w.map.rows; ty++)
    for (let tx = 0; tx < cols; tx++) {
      const a = w.regionOf[ty * cols + tx];
      if (tx + 1 < cols && w.regionOf[ty * cols + tx + 1] !== a) g.fillRect(tx * TILE + TILE - 1, ty * TILE, 1, TILE);
      if (ty + 1 < w.map.rows && w.regionOf[(ty + 1) * cols + tx] !== a) g.fillRect(tx * TILE, ty * TILE + TILE - 1, TILE, 1);
    }
  return c;
}

/** Unexplored tiles are black; explored but unseen ones are dimmed. Only the tiles in view are touched. */
function drawFog(ctx: CanvasRenderingContext2D, w: World, fog: Uint8Array, seen: Uint8Array, r: { x0: number; y0: number; x1: number; y1: number }): void {
  const cols = w.map.cols, rows = w.map.rows;
  const x0 = Math.max(0, (r.x0 / TILE) | 0), y0 = Math.max(0, (r.y0 / TILE) | 0), x1 = Math.min(cols - 1, (r.x1 / TILE) | 0), y1 = Math.min(rows - 1, (r.y1 / TILE) | 0);
  for (let pass = 0; pass < 2; pass++) {
    ctx.fillStyle = pass === 0 ? 'rgba(6,7,12,.5)' : '#07080c';
    for (let ty = y0; ty <= y1; ty++) {
      let run = -1;
      for (let tx = x0; tx <= x1 + 1; tx++) {
        const i = ty * cols + tx;
        const on = tx <= x1 && (pass === 0 ? seen[i] === 1 && fog[i] === 0 : seen[i] === 0);
        if (on && run < 0) run = tx;
        else if (!on && run >= 0) { ctx.fillRect(run * TILE, ty * TILE, (tx - run) * TILE, TILE); run = -1; }
      }
    }
  }
}

let visBuf: Uint8Array | null = null;

/** Current sight for the viewer, or null without fog. Recomputed each frame; shared with the minimap. */
export function frameVision(w: World, viewer: number): Uint8Array | null {
  if (!w.seen || w.cheats.reveal) return null;
  const n = w.map.cols * w.map.rows;
  if (!visBuf || visBuf.length !== n) visBuf = new Uint8Array(n);
  return computeVision(w, viewer, visBuf);
}

export function drawWorld(ctx: CanvasRenderingContext2D, bg: HTMLCanvasElement, w: World, v: ViewState): void {
  const { drag, alpha, cam } = v;
  const r = beginView(ctx, cam, v.dpr, v.shake);
  const vis = (x: number, y: number, pad = 16): boolean => x > r.x0 - pad && x < r.x1 + pad && y > r.y0 - pad && y < r.y1 + pad;
  ctx.drawImage(bg, 0, 0);
  if (w.regionOf && (v.layers.territory || v.layers.borders || w.regions.some((r) => r.contested))) { const t = tintLayer(w, v.layers.territory, v.layers.borders); if (t) ctx.drawImage(t, 0, 0); }
  const H = mapH(w);
  const fog = frameVision(w, v.viewer), seen = fog ? w.seen : null, cols = w.map.cols;
  const own = (team: number): boolean => w.slots[team].ally === w.slots[v.viewer].ally;
  const tileOf = (x: number, y: number): number => ((y / TILE) | 0) * cols + ((x / TILE) | 0);
  const inSight = (x: number, y: number): boolean => !fog || fog[tileOf(x, y)] === 1;
  const known = (x: number, y: number): boolean => !seen || seen[tileOf(x, y)] === 1;
  for (const m of w.mines) if (vis(m.x, m.y) && known(m.x, m.y)) drawMine(ctx, m);
  for (const s of w.slots) for (const b of s.settlements) if (vis(b.x, b.y, 24) && (own(b.team) || known(b.x, b.y))) drawBase(ctx, b, H, w.capitals[b.team] === b.region && b.region >= 0);
  for (const b of w.blds) if (b.kind !== 'tower' && vis(b.x, b.y) && (own(b.team) || known(b.x, b.y))) drawBld(ctx, b);
  for (const b of w.blds) if (b.kind === 'tower' && vis(b.x, b.y) && (own(b.team) || known(b.x, b.y))) drawBld(ctx, b);
  // Chimney smoke: a settled town has fires burning. One drifting fleck per lived-in building.
  for (const b of w.blds) {
    if (b.buildT > 0 || b.hp <= 0 || !vis(b.x, b.y) || !(own(b.team) || known(b.x, b.y))) continue;
    if (b.type !== 'house' && b.type !== 'smith' && b.type !== 'market') continue;
    const phase = ((w.tick + b.id * 97) % 160) / 160;
    if (phase > 0.75) continue;
    const drift = Math.sin((b.id % 7) + phase * 6) * 1.5;
    ctx.fillStyle = 'rgba(200,200,210,' + (0.5 * (1 - phase)).toFixed(2) + ')';
    ctx.fillRect(Math.round(b.x + 2 + drift), Math.round(b.y - 6 - phase * 9), 1, 1);
    if (b.type === 'smith') { ctx.fillStyle = 'rgba(255,170,90,' + (0.4 * (1 - phase)).toFixed(2) + ')'; ctx.fillRect(Math.round(b.x - 2 - drift), Math.round(b.y - 5 - phase * 7), 1, 1); }
  }
  const us = w.units.filter((u) => u.aboard < 0 && vis(u.x, u.y) && (own(u.team) || inSight(u.x, u.y))).sort((a, b) => a.y - b.y);
  for (const u of us) {
    const T = TYPES[u.type], sz = T.sz, h = sz / 2;
    const hidden = !unitVisible(u);
    if (hidden && !(w.slots[u.team].ally === w.slots[v.viewer].ally)) continue;
    if (hidden) ctx.globalAlpha = 0.45;
    const ux = u.ox + (u.x - u.ox) * alpha, uy = u.oy + (u.y - u.oy) * alpha;
    const x = Math.round(ux) - h, y = Math.round(uy) - h + (u.moving ? Math.floor(u.walk * 8) % 2 : 0);
    if (T.aura && w.phase === 'play') {
      ctx.strokeStyle = TEAM[u.team]; ctx.globalAlpha = 0.35;
      ctx.beginPath(); ctx.arc(ux, uy, T.aura, 0, 7); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (v.selection.has(u.id)) { ctx.strokeStyle = '#7dff7d'; ctx.strokeRect(x - 1.5, y - 1.5, sz + 3, sz + 3); }
    else if (v.hover === u.id) { ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.strokeRect(x - 1.5, y - 1.5, sz + 3, sz + 3); }
    drawSprite(ctx, u.type, u.team, x, y, 1, u.flash > 0);
    const M = maxHp(u);
    if (u.hp < M) {
      ctx.fillStyle = '#111'; ctx.fillRect(x, y - 3, sz, 2);
      ctx.fillStyle = TEAM[u.team]; ctx.fillRect(x, y - 3, Math.max(1, Math.round((sz * u.hp) / M)), 2);
    }
    const rk = w.rules.veterancy ? rank(u) : 0;
    if (rk) { ctx.fillStyle = '#f2d34a'; for (let i = 0; i < rk; i++) ctx.fillRect(x + sz - 2 - i * 2, y - 5, 1, 1); }
    if (u.rootT > 0) { ctx.fillStyle = '#4caf50'; ctx.fillRect(x, y + sz - 1, sz, 1); }
    else if (u.slowT > 0) { ctx.fillStyle = '#dde2ec'; ctx.fillRect(x, y + sz - 1, sz, 1); }
    if (hidden) ctx.globalAlpha = 1;
  }
  // Region names and state on the overlay.
  if (v.layers.names && w.regionOf) {
    // Labels keep a readable size on screen whatever the zoom.
    const fs = Math.max(3, Math.round(10 / v.cam.zoom));
    ctx.font = fs + 'px monospace';
    ctx.textAlign = 'center';
    for (const r of w.regions) {
      if (!vis(r.cx, r.cy, 40)) continue;
      const own = r.owner === v.viewer;
      let tag = '';
      if (v.layers.tags) {
        if (own && !r.connected) tag = ' CUT OFF';
        else if (own && r.garrison < r.need) tag = ' NEEDS ' + Math.ceil(r.need - r.garrison);
        else if (r.contested) tag = ' CONTESTED';
      }
      ctx.fillStyle = 'rgba(0,0,0,.55)';
      const tw = ctx.measureText(r.name.toUpperCase() + tag).width + fs;
      ctx.fillRect(r.cx - tw / 2, r.cy - fs * 0.8, tw, fs * 1.3);
      ctx.fillStyle = r.owner >= 0 ? TEAM[r.owner] : '#dde2ec';
      ctx.fillText(r.name.toUpperCase() + tag, r.cx, r.cy + fs * 0.35);
    }
    ctx.textAlign = 'left';
  }
  // Rally flag for the viewer's slot.
  const rally = w.slots[v.viewer]?.rally;
  if (rally) {
    ctx.fillStyle = '#dde2ec'; ctx.fillRect(rally.x, rally.y - 8, 1, 9);
    ctx.fillStyle = TEAM[v.viewer]; ctx.fillRect(rally.x + 1, rally.y - 8, 4, 3);
    ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.strokeRect(rally.x - 3.5, rally.y - 2.5, 7, 4);
  }
  // Works under way: a dashed square with a filling bar.
  for (const k of w.works) {
    const x = k.tx * TILE, y = k.ty * TILE;
    if (!vis(x, y)) continue;
    ctx.strokeStyle = 'rgba(242,211,74,.8)'; ctx.setLineDash([2, 2]); ctx.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1); ctx.setLineDash([]);
    const total = k.kind === 'road' ? WORK.roadT : w.map.tiles[k.ty * w.map.cols + k.tx] === 4 ? WORK.rockT : WORK.treeT;
    ctx.fillStyle = '#f2d34a'; ctx.fillRect(x + 1, y + TILE - 2, Math.round((TILE - 2) * (1 - k.t / total)), 1);
  }
  drawFx(ctx, w.fx, { damageNumbers: v.damageNumbers });
  if (fog && seen) drawFog(ctx, w, fog, seen, r);
  if (v.ghost) { ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.beginPath(); ctx.arc(v.ghost.x, v.ghost.y, v.ghost.r, 0, 7); ctx.stroke(); }
  if (v.place) {
    const p = v.place;
    ctx.fillStyle = p.ok ? 'rgba(125,255,125,.25)' : 'rgba(255,90,90,.3)';
    ctx.fillRect(p.tx * TILE, p.ty * TILE, p.w * TILE, p.h * TILE);
    ctx.strokeStyle = p.ok ? '#7dff7d' : '#ff6b6b';
    ctx.strokeRect(p.tx * TILE + 0.5, p.ty * TILE + 0.5, p.w * TILE - 1, p.h * TILE - 1);
  }
  if (drag) {
    ctx.fillStyle = 'rgba(125,255,125,.14)'; ctx.fillRect(drag.x, drag.y, drag.w, drag.h);
    ctx.strokeStyle = '#7dff7d'; ctx.strokeRect(drag.x + 0.5, drag.y + 0.5, drag.w, drag.h);
  }
  if (v.paused) { ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0); }
}
