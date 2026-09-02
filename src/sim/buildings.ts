// Building placement, removal, and passability.

import { TYPES } from '../data/units.ts';
import { BLD, type BldKey } from '../data/buildings.ts';
import { blocked, nearBase, passable, TILE } from './map.ts';
import { rnd } from './rng.ts';
import type { Building, World } from './types.ts';
import { allied, mapH, mapW, primaryBase, cheat } from './world.ts';

export function bldAt(w: World, tx: number, ty: number): Building | null {
  return w.bmap.get(ty * w.map.cols + tx) || null;
}

export function bldAtPx(w: World, x: number, y: number): Building | null {
  return bldAt(w, (x / TILE) | 0, (y / TILE) | 0);
}

/** Terrain plus buildings. Traps are passable, own or open gates are passable, walls are not. */
export type Medium = 'ground' | 'sea' | 'air';

export function passableFor(w: World, team: number, x: number, y: number, medium: Medium = 'ground'): boolean {
  if (medium === 'air') return true;
  if (medium === 'sea') {
    // Boats: water only. Bridges are high enough to pass under.
    const tx = (x / TILE) | 0, ty = (y / TILE) | 0;
    return tx >= 0 && ty >= 0 && tx < w.map.cols && ty < w.map.rows && w.map.tiles[ty * w.map.cols + tx] === 3;
  }
  const b = bldAtPx(w, x, y);
  // A bridge is a road over water for everyone.
  if (b && b.kind === 'bridge') return true;
  if (!passable(w.map, x, y)) return false;
  if (!b || b.kind === 'trap') return true;
  if (b.kind === 'gate') return allied(w, b.team, team) || !b.locked;
  return false;
}

/** Footprint cells for a building placed with its top-left tile at (tx, ty). */
export function footprint(type: BldKey, tx: number, ty: number, dir?: 'h' | 'v' | null): [number, number][] {
  const D = BLD[type];
  if (D.kind === 'gate') return dir === 'v' ? [[tx, ty], [tx, ty + 1]] : [[tx, ty], [tx + 1, ty]];
  const out: [number, number][] = [];
  for (let y = 0; y < D.h; y++) for (let x = 0; x < D.w; x++) out.push([tx + x, ty + y]);
  return out;
}

export function addBld(w: World, team: number, type: BldKey, tx: number, ty: number, dir?: 'h' | 'v' | null, construct = false): Building {
  const D = BLD[type];
  const tiles = footprint(type, tx, ty, dir);
  const b: Building = {
    ent: 'bld', id: w.nextId++, team, type, kind: D.kind, tx, ty, x: tx * TILE + (D.w * TILE) / 2, y: ty * TILE + (D.h * TILE) / 2,
    hp: D.hp, max: D.hp, cd: rnd(w.rng, 0, 0.4), dir: null, locked: null, tiles,
    buildT: construct && !cheat(w, team, 'build') ? (D.buildT ?? 0) : 0, queue: [], rally: null, level: 1,
  };
  if ((D.kind === 'wall' || D.kind === 'tower' || D.kind === 'gate') && w.rules.town) { b.max = Math.round(D.hp * (1 + 0.25 * (w.slots[team].tech.masonry ?? 0))); b.hp = b.max; }
  if (b.buildT > 0) b.hp = Math.max(1, Math.round(b.max * 0.1));
  if (D.kind === 'gate') {
    b.dir = dir || 'h';
    b.locked = true;
    const t2 = tiles[1];
    b.x = (tx * TILE + 4 + t2[0] * TILE + 4) / 2;
    b.y = (ty * TILE + 4 + t2[1] * TILE + 4) / 2;
  }
  // Founding clears trees under the footprint.
  for (const q of tiles) { const i = q[1] * w.map.cols + q[0]; if (w.map.tiles[i] === 2) { w.map.tiles[i] = 0; w.mapDirty = true; } }
  w.blds.push(b);
  for (const q of b.tiles) w.bmap.set(q[1] * w.map.cols + q[0], b);
  w.flowDirty = true;
  return b;
}

export function removeBld(w: World, b: Building): void {
  w.blds = w.blds.filter((q) => q !== b);
  for (const q of b.tiles) w.bmap.delete(q[1] * w.map.cols + q[0]);
  w.flowDirty = true;
}

/** Gates go vertical when a wall sits directly above or below. */
export function gateDir(w: World, tx: number, ty: number): 'h' | 'v' {
  const wall = (dx: number, dy: number): boolean => {
    const b = bldAt(w, tx + dx, ty + dy);
    return !!b && b.kind !== 'trap' && b.kind !== 'gate';
  };
  if (wall(0, -1) || wall(0, 1)) return 'v';
  return 'h';
}

function cellBlock(w: World, tx: number, ty: number, team: number, type: BldKey): string | null {
  if (type === 'bridge') {
    // Water only, touching a bank or another bridge on one of four sides.
    const m = w.map;
    if (tx < 0 || ty < 0 || tx >= m.cols || ty >= m.rows) return 'map edge';
    if (m.tiles[ty * m.cols + tx] !== 3) return 'bridges go on water';
    if (bldAt(w, tx, ty)) return 'something is there';
    const touch = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
      const x = tx + dx, y = ty + dy;
      if (x < 0 || y < 0 || x >= m.cols || y >= m.rows) return false;
      const b = bldAt(w, x, y);
      return m.tiles[y * m.cols + x] !== 3 || (!!b && b.kind === 'bridge');
    });
    return touch ? null : 'start from a bank';
  }
  const m = w.map;
  // The edge ring is buildable: units can walk it, so a wall that stops short of the border
  // would always leave a corridor around its end.
  if (tx < 0 || ty < 0 || tx >= m.cols || ty >= m.rows) return 'map edge';
  const t = m.tiles[ty * m.cols + tx];
  // Town buildings clear trees; walls and towers need open ground. Docks and ports are piers:
  // their planks may stand over water, only rock stops them.
  const pier = type === 'dock' || type === 'port';
  if (pier ? t === 4 : t === 3 || t === 4 || (t === 2 && BLD[type].kind !== 'town' && type !== 'castle')) return 'bad ground';
  if (bldAt(w, tx, ty)) return 'occupied';
  if (nearBase(m, tx, ty)) return 'base ground';
  for (const s of w.slots) for (const b of s.settlements) if (b.hp > 0 && Math.abs(b.x - (tx * TILE + 4)) <= 20 && Math.abs(b.y - (ty * TILE + 4)) <= 12) return 'base ground';
  for (let i = 0; i < w.nP; i++) {
    if (allied(w, i, team) || !w.slots[i].alive) continue;
    for (const eb of w.slots[i].settlements) if (Math.hypot(tx * TILE + 4 - eb.x, ty * TILE + 4 - eb.y) < 36) return 'too close to enemy base';
  }
  for (const q of w.mines) if (Math.abs(q.x - (tx * TILE + 4)) < 12 && Math.abs(q.y - (ty * TILE + 4)) < 12) return 'mine ground';
  if (BLD[type].kind !== 'trap') {
    const cx = tx * TILE + 4, cy = ty * TILE + 4;
    // Villagers step aside; soldiers do not.
    for (const u of w.units) if (u.hp > 0 && TYPES[u.type].role !== 'civ' && Math.abs(u.x - cx) < 6 && Math.abs(u.y - cy) < 6) return 'unit in the way';
  }
  return null;
}

/** A settlement needs a 5x3 clear footprint of grass or road with nothing on it. */
export function canPlaceSettlement(w: World, tx: number, ty: number): string | null {
  const m = w.map;
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -2; dx <= 2; dx++) {
      const x = tx + dx, y = ty + dy;
      if (x < 1 || y < 1 || x >= m.cols - 1 || y >= m.rows - 1) return 'too close to the edge';
      const t = m.tiles[y * m.cols + x];
      if (t === 3 || t === 4) return 'needs dry, flat ground';
      if (bldAt(w, x, y)) return 'buildings in the way';
    }
  for (const s of w.slots) for (const b of s.settlements) if (b.hp > 0 && Math.abs(b.x - (tx * TILE + 4)) < 48 && Math.abs(b.y - (ty * TILE + 4)) < 40) return 'too close to another settlement';
  for (const q of w.mines) if (Math.abs(q.x - (tx * TILE + 4)) < 20 && Math.abs(q.y - (ty * TILE + 4)) < 16) return 'mine ground';
  return null;
}

/** Null when the building fits, otherwise the reason it does not. */
export function canBuild(w: World, tx: number, ty: number, team: number, type: BldKey, dir?: 'h' | 'v' | null): string | null {
  const D = BLD[type];
  if (D.town && !w.rules.town) return 'not in this mode';
  for (const c of footprint(type, tx, ty, dir)) {
    const why = cellBlock(w, c[0], c[1], team, type);
    if (why) return why;
  }
  if (w.rules.town) {
    // The ALL BUILDINGS cheat unlocks every structure: no age, no prerequisites, no caps.
    const unlocked = cheat(w, team, 'allAges');
    const age = unlocked || !w.rules.ages ? 2 : w.slots[team].age;
    if ((D.age ?? 0) > age) return 'needs the ' + ['village', 'town', 'city'][D.age ?? 0] + ' age';
    if (!unlocked && D.max && w.blds.filter((b) => b.team === team && b.type === type).length >= D.max) return 'you have enough of those';
    if (!unlocked && D.needs) for (const n of D.needs) if (!w.blds.some((b) => b.team === team && b.type === n && b.buildT <= 0)) return 'needs a finished ' + BLD[n].name.toLowerCase();
    if (!unlocked && D.trains && type !== 'barracks' && D.kind === 'town' && !w.blds.some((b) => b.team === team && b.type === 'barracks' && b.buildT <= 0)) return 'build a barracks first';
    if (type === 'dock' || type === 'port') {
      const m = w.map;
      const cells = footprint(type, tx, ty, dir);
      const touches = (want: number): boolean => cells.some(([cx2, cy2]) => m.tiles[cy2 * m.cols + cx2] === want || [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const x = cx2 + dx, y = cy2 + dy; return x >= 0 && y >= 0 && x < m.cols && y < m.rows && m.tiles[y * m.cols + x] === want; }));
      if (!touches(3)) return 'needs a shore: water on one side';
      if (!cells.some(([cx2, cy2]) => m.tiles[cy2 * m.cols + cx2] !== 3)) return 'needs a shore: land under one corner';
    }
    // Inside your own territory, or next to your Town Hall's region.
    if (w.regionOf) {
      const cx = tx * TILE + (D.w * TILE) / 2, cy = ty * TILE + (D.h * TILE) / 2;
      const r = w.regionOf[Math.min(w.map.rows - 1, (cy / TILE) | 0) * w.map.cols + Math.min(w.map.cols - 1, (cx / TILE) | 0)];
      const reg = w.regions[r];
      const own = reg.owner === team || w.slots[team].settlements.some((s) => s.hp > 0 && s.region === r);
      if (!own && !cheat(w, team, 'territory') && type !== 'bridge') return 'outside your territory';
      if (type === 'farm' && !w.slots[team].settlements.some((s) => s.hp > 0 && Math.hypot(s.x - cx, s.y - cy) < 72)) return 'farms go near a Town Hall';
    }
  }
  return null;
}

/** The AI's starting fort: a wall line with a gate facing the map center, two towers, and an optional turret. */
export function buildFort(w: World, team: number, wallT: BldKey, towerT: BldKey, extra: boolean): void {
  const mb = w.map.bases[team], b = primaryBase(w, team);
  const cx = mapW(w) / 2, cy = mapH(w) / 2, ddx = cx - b.x, ddy = cy - b.y;
  if (Math.abs(ddy) >= Math.abs(ddx)) {
    const dv = Math.sign(ddy) || 1, gy = mb.ty + dv * 2;
    for (let dx = -4; dx <= 4; dx++) {
      if (dx === -1 || dx === 0) continue;
      const tx = mb.tx + dx;
      if (!canBuild(w, tx, gy, team, wallT)) addBld(w, team, wallT, tx, gy);
    }
    if (!canBuild(w, mb.tx - 1, gy, team, 'gat', 'h')) addBld(w, team, 'gat', mb.tx - 1, gy, 'h');
    for (const dx of [-3, 3]) {
      const tx = mb.tx + dx, ty = mb.ty + dv;
      if (!canBuild(w, tx, ty, team, towerT)) addBld(w, team, towerT, tx, ty);
    }
    if (extra && !canBuild(w, mb.tx + 4, mb.ty + dv, team, 'trt')) addBld(w, team, 'trt', mb.tx + 4, mb.ty + dv);
  } else {
    const dh = Math.sign(ddx) || 1, gx = mb.tx + dh * 3;
    for (let dy = -4; dy <= 4; dy++) {
      if (dy === -1 || dy === 0) continue;
      const ty = mb.ty + dy;
      if (!canBuild(w, gx, ty, team, wallT)) addBld(w, team, wallT, gx, ty);
    }
    if (!canBuild(w, gx, mb.ty - 1, team, 'gat', 'v')) addBld(w, team, 'gat', gx, mb.ty - 1, 'v');
    for (const dy of [-3, 3]) {
      const tx = mb.tx + dh, ty = mb.ty + dy;
      if (!canBuild(w, tx, ty, team, towerT)) addBld(w, team, towerT, tx, ty);
    }
    if (extra && !canBuild(w, mb.tx + dh, mb.ty + 4, team, 'trt')) addBld(w, team, 'trt', mb.tx + dh, mb.ty + 4);
  }
}

export { blocked };
