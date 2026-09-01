// Where to send things. Rally points, targets, and group orders, all through commands.

import { TYPES } from '../../data/units.ts';
import { applyCommand, cmd, refOf } from '../commands.ts';
import { TILE } from '../map.ts';
import type { Mine, Settlement, Target, Unit, World } from '../types.ts';
import { allied, mapH, mapW } from '../world.ts';

/** A holding's rally point: a few tiles from the settlement toward the map center. */
export function rallyPoint(w: World, b: Settlement): { x: number; y: number } {
  const cx = mapW(w) / 2, cy = mapH(w) / 2;
  const dx = cx - b.x, dy = cy - b.y, d = Math.hypot(dx, dy) || 1;
  return { x: b.x + (dx / d) * 3 * TILE, y: b.y + (dy / d) * 3 * TILE };
}

/** Nearest living hostile settlement to a point. */
export function nearestHostileBase(w: World, slot: number, x: number, y: number): Settlement | null {
  let best: Settlement | null = null, bd = Infinity;
  for (let i = 0; i < w.nP; i++) {
    if (allied(w, i, slot) || !w.slots[i].alive) continue;
    for (const b of w.slots[i].settlements) {
      if (b.hp <= 0) continue;
      const d = Math.hypot(b.x - x, b.y - y);
      if (d < bd) { bd = d; best = b; }
    }
  }
  return best;
}

export function hostileValueNear(w: World, slot: number, x: number, y: number, r: number): number {
  let v = 0;
  for (const u of w.units) if (u.hp > 0 && !allied(w, u.team, slot) && Math.hypot(u.x - x, u.y - y) <= r) v += TYPES[u.type].cost;
  return v;
}

export function ownValueNear(w: World, slot: number, x: number, y: number, r: number): number {
  let v = 0;
  for (const u of w.units) if (u.hp > 0 && allied(w, u.team, slot) && Math.hypot(u.x - x, u.y - y) <= r) v += TYPES[u.type].cost;
  return v;
}

/** Mines this slot does not hold, with how much hostile force sits on each. */
export function mineTargets(w: World, slot: number): { m: Mine; guard: number; owned: boolean }[] {
  return w.mines
    .filter((m) => m.owner < 0 || !allied(w, m.owner, slot))
    .map((m) => ({ m, guard: hostileValueNear(w, slot, m.x, m.y, 24), owned: m.owner >= 0 }));
}

export function order(w: World, slot: number, units: readonly Unit[], target: Target | null): void {
  if (!units.length) return;
  applyCommand(w, cmd(w, slot, { type: 'attack', payload: { ids: units.map((u) => u.id), target: target ? refOf(target) : null } }), true);
}

export function attackMove(w: World, slot: number, units: readonly Unit[], x: number, y: number): void {
  if (!units.length) return;
  applyCommand(w, cmd(w, slot, { type: 'attack', payload: { ids: units.map((u) => u.id), target: null, x, y } }), true);
}

export function moveTo(w: World, slot: number, units: readonly Unit[], x: number, y: number): void {
  if (!units.length) return;
  applyCommand(w, cmd(w, slot, { type: 'move', payload: { ids: units.map((u) => u.id), x, y } }), true);
}

export function pullBack(w: World, slot: number, units: readonly Unit[]): void {
  if (!units.length) return;
  applyCommand(w, cmd(w, slot, { type: 'retreat', payload: { ids: units.map((u) => u.id) } }), true);
}
