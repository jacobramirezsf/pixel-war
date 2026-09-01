// Prerendered sprites. Each unit type crossed with each team color (and the white hit flash)
// becomes one small canvas on first use, then draws with a single drawImage.

import { TEAM } from '../data/teams.ts';
import { PAL, SPR, type UnitKey } from '../data/units.ts';
import { BLD, type BldKey } from '../data/buildings.ts';

const cache = new Map<string, HTMLCanvasElement>();

/** Drop every cached sprite, for palette changes. */
export function clearAtlas(): void {
  cache.clear();
}

function renderSprite(type: UnitKey, team: number, white: boolean): HTMLCanvasElement {
  const rows = SPR[type], n = rows.length;
  const c = document.createElement('canvas');
  c.width = n; c.height = n;
  const g = c.getContext('2d')!;
  for (let r = 0; r < n; r++)
    for (let q = 0; q < n; q++) {
      const ch = rows[r][q];
      if (ch === '.') continue;
      g.fillStyle = white ? '#ffffff' : ch === 'T' ? TEAM[team] : PAL[ch];
      g.fillRect(q, r, 1, 1);
    }
  return c;
}

export function spriteImage(type: UnitKey, team: number, white: boolean): HTMLCanvasElement {
  const k = type + '/' + team + (white ? '/w' : '');
  let c = cache.get(k);
  if (!c) { c = renderSprite(type, team, white); cache.set(k, c); }
  return c;
}

/** Draw a unit sprite at scale `sc` (world pixels per sprite pixel). */
export function drawSprite(c: CanvasRenderingContext2D, type: UnitKey, team: number, x: number, y: number, sc: number, white: boolean): void {
  const img = spriteImage(type, team, white);
  c.drawImage(img, x, y, img.width * sc, img.height * sc);
}

/** Building pixels, drawn with the same rectangles as the prototype. Towers extend one row above. */
function paintBld(f: (col: string, px: number, py: number, w: number, h: number) => void, type: BldKey, tc: string): void {
  if (type === 'brb') {
    f('#5b4a2e', 1, 4, 1, 4); f('#5b4a2e', 6, 4, 1, 4); f('#8a8f9c', 0, 3, 8, 1); f('#8a8f9c', 0, 6, 8, 1);
    f('#c9ced8', 1, 2, 1, 1); f('#c9ced8', 3, 4, 1, 1); f('#c9ced8', 5, 2, 1, 1); f('#c9ced8', 2, 5, 1, 1); f('#c9ced8', 6, 7, 1, 1); f(tc, 0, 0, 2, 1);
  } else if (type === 'stk') {
    f('#5b3d1e', 1, 2, 1, 6); f('#5b3d1e', 3, 1, 1, 7); f('#5b3d1e', 5, 2, 1, 6); f('#8a5a2b', 1, 1, 1, 1); f('#8a5a2b', 3, 0, 1, 1); f('#8a5a2b', 5, 1, 1, 1); f('#3a2a14', 0, 7, 8, 1); f(tc, 7, 0, 1, 2);
  } else if (type === 'wal') {
    f('#7d8391', 0, 1, 8, 7); f('#9aa0ae', 0, 0, 8, 1); f('#5a5f6e', 0, 3, 8, 1); f('#5a5f6e', 0, 6, 8, 1); f('#5a5f6e', 3, 1, 1, 2); f('#5a5f6e', 6, 4, 1, 2); f('#5a5f6e', 1, 7, 1, 1); f(tc, 0, 0, 2, 1);
  } else if (type === 'stw') {
    f('#3d4453', 0, 1, 8, 7); f('#59637a', 0, 0, 8, 1); f('#59637a', 0, 4, 8, 1); f('#9fb0c8', 1, 2, 1, 1); f('#9fb0c8', 6, 2, 1, 1); f('#9fb0c8', 1, 6, 1, 1); f('#9fb0c8', 6, 6, 1, 1); f(tc, 0, 0, 2, 1);
  } else if (type === 'gat') {
    f('#5f6474', 0, 0, 1, 8); f('#5f6474', 7, 0, 1, 8); f('#8a5a2b', 1, 0, 6, 8); f('#5b3d1e', 1, 2, 6, 1); f('#5b3d1e', 1, 5, 6, 1); f('#f2d34a', 3, 3, 2, 2); f(tc, 0, 0, 2, 1);
  } else if (type === 'bridge') {
    f('#8a5a2b', 0, 1, 8, 6); f('#a06a35', 0, 1, 8, 1); f('#5b3d1e', 0, 3, 8, 1); f('#5b3d1e', 0, 6, 8, 1); f('#c9a46a', 0, 0, 1, 8); f('#c9a46a', 7, 0, 1, 8);
  } else if (type === 'twr') {
    f('#5b3d1e', 1, 4, 1, 8); f('#5b3d1e', 6, 4, 1, 8); f('#3a2a14', 1, 8, 6, 1); f('#8a5a2b', 0, 2, 8, 3); f('#a06a35', 0, 2, 8, 1); f('#141520', 3, 3, 2, 2); f(tc, 3, -1, 4, 2); f('#dde2ec', 2, -1, 1, 3);
  } else if (type === 'stt') {
    f('#6e7480', 1, 0, 6, 12); f('#8a8f9c', 1, 0, 6, 1); f('#4a4f5e', 0, -1, 2, 2); f('#4a4f5e', 3, -1, 2, 2); f('#4a4f5e', 6, -1, 2, 2); f('#141520', 3, 3, 2, 3); f('#4a4f5e', 1, 8, 6, 1); f(tc, 7, 1, 1, 3);
  } else if (type === 'trt') {
    f('#3d4453', 1, 6, 6, 6); f('#59637a', 1, 6, 6, 1); f('#8a8f9c', 2, 2, 4, 4); f('#c9ced8', 2, 2, 4, 1); f('#dde2ec', 5, 3, 3, 2); f(tc, 1, 1, 2, 2);
  }
}

const BLD_TOP = 1;

/** Town buildings: drawn at their footprint size, roof in the team color. */
function paintTown(f: (col: string, px: number, py: number, w: number, h: number) => void, type: BldKey, tc: string, W: number, H: number): void {
  const wall = '#8a6d47', dark = '#5b3d1e', stone = '#7d8391', shade = '#5a5f6e', roof = '#a04a3a';
  if (type === 'house') {
    f(wall, 1, 5, W - 2, H - 6); f(roof, 0, 2, W, 4); f(tc, W >> 1, 1, 2, 1); f(dark, (W >> 1) - 1, H - 4, 2, 3); f('#f2d34a', 2, 7, 2, 2);
  } else if (type === 'farm') {
    for (let y = 1; y < H - 1; y++) f(y % 2 ? '#8a7a3a' : '#6f6a2c', 1, y, W - 2, 1);
    f('#dde2ec', 1, 1, 1, H - 2); f('#dde2ec', W - 2, 1, 1, H - 2); f(tc, 0, 0, 2, 1);
  } else if (type === 'market') {
    f(wall, 1, 6, W - 2, H - 7); f('#c9a46a', 0, 3, W, 3); f(tc, 2, 2, W - 4, 1); f(dark, 4, 9, 3, 6); f('#f2d34a', 9, 8, 3, 3); f('#2b5f9e', 15, 8, 3, 3);
  } else if (type === 'smith') {
    f(shade, 1, 5, W - 2, H - 6); f(stone, 1, 4, W - 2, 1); f('#ff8c2a', 4, 9, 4, 4); f(dark, 10, 8, 4, 7); f('#4a4d5a', 3, 1, 3, 5); f(tc, 3, 0, 3, 1);
  } else if (type === 'barracks') {
    f(wall, 1, 6, W - 2, H - 7); f(dark, 1, 5, W - 2, 1); for (let x = 2; x < W - 2; x += 6) f(dark, x, 9, 2, 5); f(tc, 0, 2, 3, 4); f('#dde2ec', 3, 1, 1, 6); f(stone, W - 5, 8, 3, 3);
  } else if (type === 'range') {
    f(wall, 1, 6, W - 2, H - 7); f(roof, 0, 3, W, 3); f(tc, W - 4, 1, 3, 2); f('#dde2ec', W - 4, 0, 1, 5); f('#8a5a2b', 3, 8, 1, 6); f('#dde2ec', 4, 8, 4, 1); f('#dde2ec', 4, 13, 4, 1); f('#f2d34a', 12, 10, 3, 3);
  } else if (type === 'stable') {
    f(wall, 1, 6, W - 2, H - 7); f('#a06a35', 0, 3, W, 3); f(tc, 1, 1, 3, 2); f(dark, 4, 9, 6, 6); f(dark, 13, 9, 6, 6); f('#e8b88a', 6, 10, 2, 2);
  } else if (type === 'siege') {
    f(shade, 1, 6, W - 2, H - 7); f(stone, 1, 5, W - 2, 1); f(dark, 3, 9, 8, 3); f('#8a8f9c', 4, 7, 2, 2); f('#f2d34a', 14, 8, 5, 5); f(tc, W - 4, 1, 3, 3);
  } else if (type === 'wonder') {
    // A stepped monument: three tiers of pale stone, gold crown, banners at the corners.
    f('#5a5f6e', 0, H - 8, W, 8); f('#7d8391', 0, H - 8, W, 1);
    f('#7d8391', 4, H - 15, W - 8, 8); f('#9aa0ae', 4, H - 15, W - 8, 1);
    f('#9aa0ae', 9, H - 22, W - 18, 8); f('#c9ced8', 9, H - 22, W - 18, 1);
    f('#f2d34a', 13, H - 27, W - 26, 5); f('#fff2a8', 14, H - 28, W - 28, 1);
    f('#141520', (W >> 1) - 2, H - 5, 4, 5); f('#141520', 7, H - 12, 2, 3); f('#141520', W - 9, H - 12, 2, 3);
    f('#dde2ec', 1, H - 14, 1, 7); f(tc, 2, H - 14, 3, 2); f('#dde2ec', W - 2, H - 14, 1, 7); f(tc, W - 5, H - 14, 3, 2);
  } else if (type === 'castle') {
    f(stone, 1, 3, W - 2, H - 4); f(shade, 1, 3, W - 2, 1); f('#4a4f5e', 0, 0, 5, 6); f('#4a4f5e', W - 5, 0, 5, 6); f('#4a4f5e', 0, H - 6, 5, 6); f('#4a4f5e', W - 5, H - 6, 5, 6);
    f('#141520', (W >> 1) - 2, H - 8, 4, 8); f('#dde2ec', W >> 1, 0, 1, 6); f(tc, (W >> 1) + 1, 0, 4, 3); f('#9aa0ae', 6, 8, 2, 2); f('#9aa0ae', W - 8, 8, 2, 2);
  }
}

function bldImage(type: BldKey, team: number): HTMLCanvasElement {
  const k = 'b/' + type + '/' + team;
  let c = cache.get(k);
  if (c) return c;
  const D = BLD[type];
  c = document.createElement('canvas');
  const W = D.w * 8, H = D.h * 8;
  c.width = W; c.height = H + BLD_TOP + 5;
  const g = c.getContext('2d')!;
  const f = (col: string, px: number, py: number, w: number, h: number): void => { g.fillStyle = col; g.fillRect(px, py + BLD_TOP, w, h); };
  if (D.kind === 'town' || type === 'castle' || type === 'wonder') paintTown(f, type, TEAM[team], W, H);
  else paintBld(f, type, TEAM[team]);
  cache.set(k, c);
  return c;
}

export function drawBldSpr(c: CanvasRenderingContext2D, type: BldKey, team: number, x: number, y: number, sc: number): void {
  const img = bldImage(type, team);
  c.drawImage(img, x, y - BLD_TOP * sc, img.width * sc, img.height * sc);
}

