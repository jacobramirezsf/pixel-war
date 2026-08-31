// Prerendered sprites. Each unit type crossed with each team color (and the white hit flash)
// becomes one small canvas on first use, then draws with a single drawImage.

import { TEAM } from '../data/teams.ts';
import { PAL, SPR, type UnitKey } from '../data/units.ts';
import type { BldKey } from '../data/buildings.ts';

const cache = new Map<string, HTMLCanvasElement>();

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
  } else if (type === 'twr') {
    f('#5b3d1e', 1, 4, 1, 8); f('#5b3d1e', 6, 4, 1, 8); f('#3a2a14', 1, 8, 6, 1); f('#8a5a2b', 0, 2, 8, 3); f('#a06a35', 0, 2, 8, 1); f('#141520', 3, 3, 2, 2); f(tc, 3, -1, 4, 2); f('#dde2ec', 2, -1, 1, 3);
  } else if (type === 'stt') {
    f('#6e7480', 1, 0, 6, 12); f('#8a8f9c', 1, 0, 6, 1); f('#4a4f5e', 0, -1, 2, 2); f('#4a4f5e', 3, -1, 2, 2); f('#4a4f5e', 6, -1, 2, 2); f('#141520', 3, 3, 2, 3); f('#4a4f5e', 1, 8, 6, 1); f(tc, 7, 1, 1, 3);
  } else if (type === 'trt') {
    f('#3d4453', 1, 6, 6, 6); f('#59637a', 1, 6, 6, 1); f('#8a8f9c', 2, 2, 4, 4); f('#c9ced8', 2, 2, 4, 1); f('#dde2ec', 5, 3, 3, 2); f(tc, 1, 1, 2, 2);
  }
}

const BLD_TOP = 1;

function bldImage(type: BldKey, team: number): HTMLCanvasElement {
  const k = 'b/' + type + '/' + team;
  let c = cache.get(k);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = 8; c.height = 8 + BLD_TOP + 5;
  const g = c.getContext('2d')!;
  paintBld((col, px, py, w, h) => { g.fillStyle = col; g.fillRect(px, py + BLD_TOP, w, h); }, type, TEAM[team]);
  cache.set(k, c);
  return c;
}

export function drawBldSpr(c: CanvasRenderingContext2D, type: BldKey, team: number, x: number, y: number, sc: number): void {
  const img = bldImage(type, team);
  c.drawImage(img, x, y - BLD_TOP * sc, img.width * sc, img.height * sc);
}

