// Ground works: roads laid and trees or rock cleared over a few seconds. The land changes when
// the work is done, and every flow field is rebuilt then.

import { GROUND, WORK, type GroundKey } from '../data/buildings.ts';
import { TILE } from './map.ts';
import type { World } from './types.ts';
import { cheat, say } from './world.ts';

/** Why the work cannot start here, or null. */
export function canWork(w: World, slot: number, tx: number, ty: number, kind: GroundKey): string | null {
  const m = w.map;
  if (tx < 0 || ty < 0 || tx >= m.cols || ty >= m.rows) return 'map edge';
  const t = m.tiles[ty * m.cols + tx];
  if (kind === 'road' && t !== 0) return t === 1 ? 'already a road' : t === 2 ? 'clear the trees first' : 'needs open ground';
  if (kind === 'clear' && t !== 2 && t !== 4) return 'nothing to clear';
  if (w.bmap.has(ty * m.cols + tx)) return 'a building is there';
  if (w.works.some((k) => k.tx === tx && k.ty === ty)) return 'already under way';
  if (w.mode === 'conquest' && w.regionOf && !cheat(w, slot, 'territory')) {
    const r = w.regions[w.regionOf[ty * m.cols + tx]];
    const own = r.owner === slot || w.slots[slot].settlements.some((s) => s.hp > 0 && s.region === r.id);
    if (!own) return 'outside your territory';
  }
  return null;
}

/** Cost in gold and materials for a work at this tile. */
export function workCost(w: World, tx: number, ty: number, kind: GroundKey): { gold: number; mat: number } {
  if (kind === 'road') return { gold: GROUND.road.cost, mat: 0 };
  const rock = w.map.tiles[ty * w.map.cols + tx] === 4;
  return { gold: rock ? WORK.rockGold : GROUND.clear.cost, mat: rock && w.mode === 'conquest' && w.rules.materials ? WORK.rockMat : 0 };
}

export function startWork(w: World, slot: number, tx: number, ty: number, kind: GroundKey): boolean {
  const why = canWork(w, slot, tx, ty, kind);
  if (why) { say(w, 'Cannot ' + kind + ': ' + why, 1); return false; }
  const s = w.slots[slot];
  const cost = cheat(w, slot, 'freeBuild') ? { gold: 0, mat: 0 } : workCost(w, tx, ty, kind);
  if (s.gold < cost.gold) { say(w, 'Need ' + cost.gold + ' gold', 1); return false; }
  if (s.mat < cost.mat) { say(w, 'Need ' + cost.mat + ' materials', 1); return false; }
  s.gold -= cost.gold;
  s.mat -= cost.mat;
  const rock = w.map.tiles[ty * w.map.cols + tx] === 4;
  const t = cheat(w, slot, 'build') ? 0 : kind === 'road' ? WORK.roadT : rock ? WORK.rockT : WORK.treeT;
  w.works.push({ tx, ty, kind, team: slot, t });
  if (t <= 0) finish(w, w.works[w.works.length - 1]);
  return true;
}

function finish(w: World, k: import('./types.ts').Work): void {
  const i = k.ty * w.map.cols + k.tx;
  w.map.tiles[i] = k.kind === 'road' ? 1 : 0;
  w.mapDirty = true;
  w.flowDirty = true;
  w.works = w.works.filter((x) => x !== k);
  w.fx.push({ k: 'fix', x: k.tx * TILE + 4, y: k.ty * TILE + 2, t: 0.4 });
}

export function worksTick(w: World, dt: number): void {
  if (!w.works.length) return;
  for (const k of w.works.slice()) {
    k.t -= dt;
    if (k.t <= 0) finish(w, k);
  }
}

/** Tear up a road tile. Returns true when there was one. */
export function unroad(w: World, slot: number, tx: number, ty: number): boolean {
  const i = ty * w.map.cols + tx;
  if (w.map.tiles[i] !== 1 || w.bmap.has(i)) return false;
  if (w.mode === 'conquest' && w.regionOf && !cheat(w, slot, 'territory')) {
    const r = w.regions[w.regionOf[i]];
    if (!(r.owner === slot || w.slots[slot].settlements.some((s) => s.hp > 0 && s.region === r.id))) return false;
  }
  w.map.tiles[i] = 0;
  w.mapDirty = true;
  w.flowDirty = true;
  w.slots[slot].gold += 1;
  return true;
}
