// Unit creation and spawning.

import { TYPES, type UnitKey } from '../data/units.ts';
import { passableFor } from './buildings.ts';
import { rnd } from './rng.ts';
import type { Unit, World } from './types.ts';
import { count, mapH, primaryBase } from './world.ts';

export function mkUnit(w: World, team: number, type: UnitKey, x: number, y: number): Unit {
  const T = TYPES[type];
  return {
    ent: 'unit', id: w.nextId++, team, type, x, y, hp: T.hp, cd: rnd(w.rng, 0, 0.4), order: null,
    flash: 0, walk: 0, moving: false, held: false, blk: null, px: x, py: y, ox: x, oy: y,
    slowT: 0, rootT: 0, reveal: 0, run: 0, blinkT: 0, dropT: T.dropTrap ? T.dropTrap / 2 : 0,
  };
}

/** Spawn just in front of the team's base. Null when the army cap is reached. */
export function spawn(w: World, team: number, type: UnitKey): Unit | null {
  if (count(w, team) >= w.cap) return null;
  const b = primaryBase(w, team), dy = b.y < mapH(w) / 2 ? 16 : -16;
  let x = b.x, y = b.y + dy;
  for (let i = 0; i < 8; i++) {
    const px = b.x + rnd(w.rng, -14, 14), py = b.y + dy + rnd(w.rng, -3, 3);
    if (passableFor(w, team, px, py)) { x = px; y = py; break; }
  }
  const u = mkUnit(w, team, type, x, y);
  w.units.push(u);
  return u;
}
