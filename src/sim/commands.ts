// Player actions. Every function takes the acting slot. The UI never mutates the world directly.
// M1 wraps these as a command queue with tick stamps.

import { BLD, BUILD_CAP, type BldKey } from '../data/buildings.ts';
import { TNAME } from '../data/teams.ts';
import { TYPES, type UnitKey } from '../data/units.ts';
import { addBld, bldAtPx, canBuild, gateDir, passableFor, removeBld } from './buildings.ts';
import { clamp, TILE } from './map.ts';
import type { Building, Target, World } from './types.ts';
import { mkUnit, spawn } from './units.ts';
import { allied, count, mapH, mapW, say, selected } from './world.ts';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Buy a unit at the base. Returns false and sets a message when it cannot. */
export function buyUnit(w: World, slot: number, k: UnitKey): boolean {
  const T = TYPES[k], s = w.slots[slot];
  if (s.gold < T.cost) { say(w, 'Need ' + T.cost + ' gold', 1.2); return false; }
  if (!spawn(w, slot, k)) { say(w, 'Army cap reached (' + w.cap + ')', 1.5); return false; }
  s.gold -= T.cost;
  say(w, T.name + ' ready', 1);
  return true;
}

export function toggleGate(w: World, gb: Building): void {
  gb.locked = !gb.locked;
  w.flowDirty = true;
  say(w, gb.locked ? 'Gate locked' : 'Gate open', 1.2);
}

/** Tap on the map: pick a unit, toggle a gate, or order the selection. */
export function tap(w: World, slot: number, x: number, y: number): void {
  let best = null, bd = 7;
  for (const u of w.units) {
    if (u.team !== slot) continue;
    const d = Math.hypot(u.x - x, u.y - y);
    if (d < bd) { bd = d; best = u; }
  }
  if (best) {
    const only = best.sel && w.units.filter((u) => u.sel).length === 1;
    for (const u of w.units) u.sel = false;
    if (!only) best.sel = true;
    return;
  }
  const gb = bldAtPx(w, x, y);
  if (gb && gb.kind === 'gate' && gb.team === slot) { toggleGate(w, gb); return; }
  const sel = selected(w);
  if (!sel.length) { say(w, 'Select units first: tap one or drag a box', 2); return; }
  let en: Target | null = null;
  bd = 8;
  for (const u of w.units) {
    if (allied(w, u.team, slot)) continue;
    const d = Math.hypot(u.x - x, u.y - y);
    if (d < bd) { bd = d; en = u; }
  }
  if (!en) { const bl = bldAtPx(w, x, y); if (bl && !allied(w, bl.team, slot)) en = bl; }
  if (!en)
    outer: for (let i = 0; i < w.nP; i++) {
      if (allied(w, i, slot) || !w.slots[i].alive) continue;
      for (const eb of w.slots[i].settlements) if (Math.abs(x - eb.x) < 14 && Math.abs(y - eb.y) < 12) { en = eb; break outer; }
    }
  if (en) { for (const u of sel) u.order = { type: 'attack', tgt: en }; say(w, 'Attacking', 1); return; }
  const W = mapW(w), H = mapH(w);
  sel.forEach((u, i) => {
    const a = i * 2.4, r = Math.sqrt(i) * 3.4;
    u.order = { type: 'move', x: clamp(x + Math.cos(a) * r, 4, W - 4), y: clamp(y + Math.sin(a) * r, 4, H - 4) };
  });
  w.fx.push({ k: 'ping', x, y, t: 0.4 });
}

/** Box select. Returns how many units were picked. */
export function boxSelect(w: World, slot: number, d: Rect): number {
  let n = 0;
  for (const u of w.units) {
    u.sel = false;
    if (u.team === slot && u.x >= d.x && u.x <= d.x + d.w && u.y >= d.y && u.y <= d.y + d.h) { u.sel = true; n++; }
  }
  say(w, n ? n + ' selected' : 'No units there', 1.2);
  return n;
}

export function selectAll(w: World, slot: number): number {
  let n = 0;
  for (const u of w.units) if (u.team === slot) { u.sel = true; n++; }
  say(w, n ? 'All ' + n + ' selected' : 'No units yet', 1.2);
  return n;
}

export function clearSelection(w: World): void {
  for (const u of w.units) u.sel = false;
}

/** Selected units attack-move. With nothing selected, the whole army goes. */
export function charge(w: World, slot: number): void {
  let sel = selected(w);
  if (!sel.length) sel = w.units.filter((u) => u.team === slot);
  if (!sel.length) { say(w, 'No units to send', 1.2); return; }
  for (const u of sel) u.order = { type: 'attack', tgt: null };
  say(w, 'Charge!', 1.2);
}

export function hold(w: World): void {
  for (const u of w.units) if (u.sel) u.order = null;
  say(w, 'Holding', 1);
}

export function togglePause(w: World): void {
  w.paused = !w.paused;
  say(w, w.paused ? 'Paused. You can still give orders.' : 'Resumed', 1.5);
}

/** Place a building at a pixel position. Free in Sandbox edit. Returns the reason on failure. */
export function buildAt(w: World, slot: number, x: number, y: number, type: BldKey, free: boolean): string | null {
  const m = w.map, tx = clamp((x / TILE) | 0, 0, m.cols - 1), ty = clamp((y / TILE) | 0, 0, m.rows - 1);
  const D = BLD[type], gdir = D.kind === 'gate' ? gateDir(w, tx, ty) : null;
  const why = canBuild(w, tx, ty, slot, type, gdir);
  if (why) { say(w, 'Cannot build: ' + why, 1); return why; }
  let n = 0;
  for (const b of w.blds) if (b.team === slot) n++;
  if (n >= BUILD_CAP) { say(w, 'Build cap is ' + BUILD_CAP + ' per team', 1.2); return 'cap'; }
  if (!free) {
    if (w.slots[slot].gold < D.cost) { say(w, 'Need ' + D.cost + ' gold', 1); return 'gold'; }
    w.slots[slot].gold -= D.cost;
  }
  addBld(w, slot, type, tx, ty, gdir);
  return null;
}

/** Sell one of your buildings for half its cost. Free in Sandbox. */
export function sellAt(w: World, slot: number, x: number, y: number): void {
  const b = bldAtPx(w, x, y);
  if (!b || b.team !== slot) { say(w, 'Tap one of your buildings', 1); return; }
  removeBld(w, b);
  if (w.mode !== 'sand') w.slots[slot].gold += Math.floor(BLD[b.type].cost / 2);
  say(w, 'Sold ' + BLD[b.type].name, 0.8);
}

// ---------- sandbox editing ----------

/** Drop a unit in Sandbox edit. Tapping your own gate toggles it instead. */
export function placeUnit(w: World, slot: number, brush: UnitKey, x: number, y: number): void {
  const gb = bldAtPx(w, x, y);
  if (gb && gb.kind === 'gate' && gb.team === slot) { toggleGate(w, gb); return; }
  if (count(w, slot) >= w.cap) { say(w, 'Cap is ' + w.cap + ' per team', 1.2); return; }
  x = clamp(x, 4, mapW(w) - 4);
  y = clamp(y, 4, mapH(w) - 4);
  if (!passableFor(w, slot, x, y) && !TYPES[brush].fly) { say(w, 'Blocked ground', 1); return; }
  w.units.push(mkUnit(w, slot, brush, x, y));
}

/** Remove the nearest unit within 7px, or the building under the point. */
export function eraseAt(w: World, x: number, y: number): void {
  let b = null, bd = 7;
  for (const u of w.units) { const d = Math.hypot(u.x - x, u.y - y); if (d < bd) { bd = d; b = u; } }
  if (b) { w.units = w.units.filter((u) => u !== b); return; }
  const bl = bldAtPx(w, x, y);
  if (bl) removeBld(w, bl);
}

export function clearAll(w: World): void {
  w.units = [];
  w.blds = [];
  w.bmap.clear();
  w.flowDirty = true;
  say(w, 'Map cleared', 1);
}

/** Point-mirror one side's units and buildings onto the other side. */
export function mirror(w: World, me: number): void {
  const other = 1 - me, src = w.units.filter((u) => u.team === me), sb = w.blds.filter((b) => b.team === me);
  if (!src.length && !sb.length) { say(w, 'Nothing to mirror for ' + TNAME[me], 1.2); return; }
  const W = mapW(w), H = mapH(w);
  w.units = w.units.filter((u) => u.team === me);
  for (const b of w.blds.filter((b) => b.team === other)) removeBld(w, b);
  for (const u of src) {
    const x = W - u.x, y = H - u.y;
    if (passableFor(w, other, x, y) || TYPES[u.type].fly) w.units.push(mkUnit(w, other, u.type, x, y));
  }
  for (const b of sb) {
    let tx = w.map.cols - 1 - b.tx, ty = w.map.rows - 1 - b.ty;
    if (b.kind === 'gate') { if (b.dir === 'h') tx -= 1; else ty -= 1; }
    if (!canBuild(w, tx, ty, other, b.type, b.dir)) {
      const nb = addBld(w, other, b.type, tx, ty, b.dir);
      if (b.locked === false) nb.locked = false;
    }
  }
  say(w, TNAME[other] + ' now mirrors ' + TNAME[me], 1.5);
}

export function takeSnap(w: World): void {
  w.snap = {
    units: w.units.map((u) => ({ team: u.team, type: u.type, x: u.x, y: u.y })),
    blds: w.blds.map((b) => ({ team: b.team, type: b.type, tx: b.tx, ty: b.ty, dir: b.dir, locked: b.locked })),
  };
}

export function restoreSnap(w: World): void {
  if (!w.snap) return;
  w.units = w.snap.units.map((s) => mkUnit(w, s.team, s.type, s.x, s.y));
  w.blds = [];
  w.bmap.clear();
  w.flowDirty = true;
  for (const s of w.snap.blds) {
    const nb = addBld(w, s.team, s.type, s.tx, s.ty, s.dir);
    if (s.locked === false) nb.locked = false;
  }
}

/** Sandbox: snapshot the layout and start the fight. Returns false with nothing placed. */
export function startBattle(w: World): boolean {
  if (w.phase === 'edit') {
    if (!w.units.length && !w.blds.length) { say(w, 'Place some units first', 1.5); return false; }
    takeSnap(w);
  }
  w.phase = 'play';
  w.over = null;
  w.paused = false;
  w.fx = [];
  restoreSnap(w);
  for (const u of w.units) u.order = { type: 'attack', tgt: null };
  for (const s of w.slots) { s.alive = true; for (const b of s.settlements) b.hp = b.max; }
  w.t = 0;
  say(w, 'Fight. Tap units to take command.', 2.5);
  return true;
}

/** Sandbox: back to editing with the last layout restored. */
export function toEdit(w: World): void {
  w.phase = 'edit';
  w.over = null;
  w.fx = [];
  w.paused = false;
  if (w.snap) restoreSnap(w);
  for (const s of w.slots) { s.alive = true; for (const b of s.settlements) b.hp = b.max; }
  say(w, 'Edit armies and defenses, then hit PLAY', 2);
}
