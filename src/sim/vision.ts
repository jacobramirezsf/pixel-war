// Fog of war. The sim remembers what the player has explored; what is visible right now is
// recomputed from unit and building positions by whoever asks (the renderer, the minimap).

import { BLD } from '../data/buildings.ts';
import { TYPES } from '../data/units.ts';
import { unitVision, VISION } from '../data/vision.ts';
import { TILE } from './map.ts';
import type { World } from './types.ts';
import { WONDER } from './wonder.ts';
import { sworn } from './world.ts';

function stamp(out: Uint8Array, cols: number, rows: number, x: number, y: number, r: number): void {
  const cx = (x / TILE) | 0, cy = (y / TILE) | 0, r2 = r * r;
  const y0 = Math.max(0, cy - r), y1 = Math.min(rows - 1, cy + r), x0 = Math.max(0, cx - r), x1 = Math.min(cols - 1, cx + r);
  for (let ty = y0; ty <= y1; ty++) {
    const dy = ty - cy;
    for (let tx = x0; tx <= x1; tx++) { const dx = tx - cx; if (dx * dx + dy * dy <= r2) out[ty * cols + tx] = 1; }
  }
}

/** What `slot` and its allies can see this instant, one byte per tile. */
export function computeVision(w: World, slot: number, out: Uint8Array): Uint8Array {
  const cols = w.map.cols, rows = w.map.rows;
  out.fill(0);
  const side = (team: number): boolean => team === slot || sworn(w, team, slot);
  for (const u of w.units) if (u.hp > 0 && side(u.team)) stamp(out, cols, rows, u.x, u.y, unitVision(TYPES[u.type]));
  for (const b of w.blds) if (b.hp > 0 && side(b.team)) stamp(out, cols, rows, b.x, b.y, b.type === 'wonder' && b.buildT <= 0 ? WONDER.vision : BLD[b.type].kind === 'tower' ? VISION.tower : VISION.building);
  for (const s of w.slots) for (const b of s.settlements) if (b.hp > 0 && side(b.team)) stamp(out, cols, rows, b.x, b.y, VISION.settlement);
  return out;
}

let scratch: Uint8Array | null = null;

/** Fold the player's current sight into the explored map. Runs every few ticks. */
export function visionTick(w: World): void {
  if (!w.seen || w.tick % VISION.every !== 0) return;
  const n = w.map.cols * w.map.rows;
  if (!scratch || scratch.length !== n) scratch = new Uint8Array(n);
  computeVision(w, 0, scratch);
  const seen = w.seen;
  for (let i = 0; i < n; i++) if (scratch[i]) seen[i] = 1;
}

export const seenAt = (w: World, x: number, y: number): boolean => {
  if (!w.seen) return true;
  const tx = (x / TILE) | 0, ty = (y / TILE) | 0;
  if (tx < 0 || ty < 0 || tx >= w.map.cols || ty >= w.map.rows) return false;
  return w.seen[ty * w.map.cols + tx] === 1;
};
