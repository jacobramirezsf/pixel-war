// Terrain tiles, prerendered once per map into an offscreen canvas.

import { hash } from '../sim/mapgen.ts';
import { TILE, type MapDef } from '../sim/map.ts';

export function drawTile(c: CanvasRenderingContext2D, t: number, x: number, y: number, sc: number, r: number): void {
  const f = (col: string, px: number, py: number, w: number, h: number): void => { c.fillStyle = col; c.fillRect(x + px * sc, y + py * sc, w * sc, h * sc); };
  if (t === 1) { f(r < 0.5 ? '#8a6d47' : '#937650', 0, 0, 8, 8); if (r > 0.8) f('#7a5e3c', 3, 2, 2, 1); return; }
  if (t === 3) { f(r < 0.5 ? '#2b5f9e' : '#2f66a8', 0, 0, 8, 8); if (r > 0.6) f('#4a84c4', 2, 3, 3, 1); if (r < 0.25) f('#4a84c4', 4, 6, 3, 1); return; }
  f(r < 0.6 ? '#3f7d3f' : r < 0.85 ? '#447f44' : '#3a763a', 0, 0, 8, 8);
  if (t === 0 && r > 0.88) { f('#5aa05a', 2, 3, 1, 2); f('#5aa05a', 5, 5, 1, 2); }
  if (t === 2) { f('#2c5a2c', 1, 1, 6, 5); f('#3a6f3a', 2, 1, 2, 2); f('#5b3d1e', 3, 6, 2, 2); }
  if (t === 4) { f('#6e7280', 1, 2, 6, 5); f('#8a8f9c', 2, 1, 4, 1); f('#4a4d5a', 1, 6, 6, 1); }
}

export function buildBg(m: MapDef, into?: HTMLCanvasElement): HTMLCanvasElement {
  const bg = into ?? document.createElement('canvas');
  bg.width = m.cols * TILE;
  bg.height = m.rows * TILE;
  const bc = bg.getContext('2d')!;
  for (let ty = 0; ty < m.rows; ty++)
    for (let tx = 0; tx < m.cols; tx++) drawTile(bc, m.tiles[ty * m.cols + tx], tx * TILE, ty * TILE, 1, hash(tx, ty));
  // Shoreline: water against land gets a light edge, so coasts read at every zoom.
  bc.fillStyle = '#5b95cf';
  for (let ty = 0; ty < m.rows; ty++)
    for (let tx = 0; tx < m.cols; tx++) {
      if (m.tiles[ty * m.cols + tx] !== 3) continue;
      const land = (dx: number, dy: number): boolean => { const x = tx + dx, y = ty + dy; return x >= 0 && y >= 0 && x < m.cols && y < m.rows && m.tiles[y * m.cols + x] !== 3; };
      if (land(0, -1)) bc.fillRect(tx * TILE, ty * TILE, TILE, 1);
      if (land(0, 1)) bc.fillRect(tx * TILE, ty * TILE + TILE - 1, TILE, 1);
      if (land(-1, 0)) bc.fillRect(tx * TILE, ty * TILE, 1, TILE);
      if (land(1, 0)) bc.fillRect(tx * TILE + TILE - 1, ty * TILE, 1, TILE);
    }
  return bg;
}
