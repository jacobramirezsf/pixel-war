// Read-only questions the UI and bots ask about the world. Nothing here mutates.

import type { Building, Settlement, Target, Unit, World } from './types.ts';
import { allied } from './world.ts';
import { bldAtPx } from './buildings.ts';

export function unitAt(w: World, slot: number, x: number, y: number, r = 7): Unit | null {
  let best: Unit | null = null, bd = r;
  for (const u of w.units) {
    if (u.team !== slot || u.hp <= 0) continue;
    const d = Math.hypot(u.x - x, u.y - y);
    if (d < bd) { bd = d; best = u; }
  }
  return best;
}

export function hostileUnitAt(w: World, slot: number, x: number, y: number, r = 8): Unit | null {
  let best: Unit | null = null, bd = r;
  for (const u of w.units) {
    if (allied(w, u.team, slot) || u.hp <= 0) continue;
    const d = Math.hypot(u.x - x, u.y - y);
    if (d < bd) { bd = d; best = u; }
  }
  return best;
}

export function ownGateAt(w: World, slot: number, x: number, y: number): Building | null {
  const b = bldAtPx(w, x, y);
  return b && b.kind === 'gate' && b.team === slot ? b : null;
}

export function hostileBaseAt(w: World, slot: number, x: number, y: number): Settlement | null {
  for (let i = 0; i < w.nP; i++) {
    if (allied(w, i, slot) || !w.slots[i].alive) continue;
    for (const eb of w.slots[i].settlements) if (eb.hp > 0 && Math.abs(x - eb.x) < 14 && Math.abs(y - eb.y) < 12) return eb;
  }
  return null;
}

/** What a tap on a point would attack for this slot, if anything. */
export function hostileAt(w: World, slot: number, x: number, y: number): Target | null {
  const u = hostileUnitAt(w, slot, x, y);
  if (u) return u;
  const b = bldAtPx(w, x, y);
  if (b && !allied(w, b.team, slot)) return b;
  return hostileBaseAt(w, slot, x, y);
}

export function unitsOf(w: World, slot: number): Unit[] {
  return w.units.filter((u) => u.team === slot && u.hp > 0);
}

export function idsOf(us: readonly Unit[]): number[] {
  return us.map((u) => u.id);
}

export function armyValue(w: World, slot: number, TYPES: Record<string, { cost: number }>): number {
  let v = 0;
  for (const u of w.units) if (u.team === slot && u.hp > 0) v += TYPES[u.type].cost;
  return v;
}
