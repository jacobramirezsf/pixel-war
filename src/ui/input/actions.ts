// What a pointer means in world coordinates, independent of how it got there.
// Touch and mouse both end up here. Everything that changes the sim goes out as a command.

import { synth } from '../../audio/synth.ts';
import { POWERS } from '../../data/powers.ts';
import { cheatTap } from '../cheats.ts';
import { refOf } from '../../sim/commands.ts';
import { BLD } from '../../data/buildings.ts';
import { TYPES } from '../../data/units.ts';
import { canBuild } from '../../sim/buildings.ts';
import { clamp, TILE } from '../../sim/map.ts';
import { foreignAt, hostileAt, ownGateAt, settleAt, unitAt } from '../../sim/queries.ts';
import { bldAtPx } from '../../sim/buildings.ts';
import { relation } from '../../sim/conquest.ts';
import { TNAME } from '../../data/teams.ts';
import { issueAction, say, selectedUnits, type App, clearSelection } from '../app.ts';
import { paint } from '../menus/editor.ts';

export interface Rect { x: number; y: number; w: number; h: number }

export function boxSelect(app: App, d: Rect, additive = false): void {
  const w = app.world;
  if (!w) return;
  if (!additive) app.selection.clear();
  for (const u of w.units) if (u.team === app.ctl && u.hp > 0 && u.x >= d.x && u.x <= d.x + d.w && u.y >= d.y && u.y <= d.y + d.h) app.selection.add(u.id);
  const n = app.selection.size;
  say(app, n ? n + ' selected' : 'No units there', 1.2);
  app.ui.updateUI();
}

/** Select the own unit at a point. Returns true when there was one. */
export function selectAt(app: App, x: number, y: number, additive = false): boolean {
  const w = app.world;
  if (!w) return false;
  const own = unitAt(w, app.ctl, x, y);
  if (!own) { if (!additive) app.selection.clear(); return false; }
  synth.play('select');
  if (additive) { if (app.selection.has(own.id)) app.selection.delete(own.id); else app.selection.add(own.id); return true; }
  const only = app.selection.has(own.id) && selectedUnits(app).length === 1;
  app.selection.clear();
  if (!only) app.selection.add(own.id);
  return true;
}

/** A friendly thing under a point: unit, building, or settlement. For guard. */
function friendlyAt(app: App, x: number, y: number): import('../../sim/types.ts').Target | null {
  const w = app.world!;
  const u = unitAt(w, app.ctl, x, y, 8);
  if (u) return u;
  for (const b of w.blds) if (b.team === app.ctl && b.tiles.some((t) => Math.abs(t[0] * TILE + 4 - x) <= 4 && Math.abs(t[1] * TILE + 4 - y) <= 4)) return b;
  for (const s of w.slots[app.ctl].settlements) if (s.hp > 0 && Math.abs(s.x - x) < 14 && Math.abs(s.y - y) < 12) return s;
  return null;
}

/** Tap targets grow as the camera pulls back, so far-out taps still land on what you meant. */
export function hitR(app: App): number {
  return 6 + 10 / Math.max(1, app.cam.zoom);
}

/** Order the selection to a point. An enemy under the point is always the target; otherwise the armed mode decides. */
export function orderAt(app: App, x: number, y: number): boolean {
  const w = app.world;
  if (!w) return false;
  const sel = selectedUnits(app);
  if (!sel.length) { say(app, 'Select units first: tap one or drag a box', 2); return false; }
  const ids = sel.map((u) => u.id);
  const mode = app.stance;
  app.stance = 'none';
  app.ui.updateUI();
  const en = hostileAt(w, app.ctl, x, y, hitR(app));
  if (en) { app.warAsk = null; return issueAction(app, { type: 'attack', payload: { ids, target: refOf(en) } }); }
  // Someone at peace or allied: the first tap asks, the second declares war and attacks.
  const fo = mode !== 'guard' ? foreignAt(w, app.ctl, x, y) : null;
  if (fo) {
    const ref = refOf(fo), name = TNAME[fo.team];
    const ask = app.warAsk;
    if (ask && ask.team === fo.team && ask.ref.kind === ref.kind && ask.ref.id === ref.id) { app.warAsk = null; app.ui.updateUI(); return issueAction(app, { type: 'attack', payload: { ids, target: ref, declare: true } }); }
    const rel = relation(w, app.ctl, fo.team);
    app.warAsk = { team: fo.team, ref, name };
    app.ui.updateUI();
    say(app, (rel === 'allied' ? 'ATTACK AN ALLY? ' : '') + 'Attacking will declare war on ' + name + '. Tap again to confirm.', 3);
    return false;
  }
  if (mode === 'attack') return issueAction(app, { type: 'attack', payload: { ids, target: null, x, y } });
  if (mode === 'guard') {
    const f = friendlyAt(app, x, y);
    return issueAction(app, { type: 'guard', payload: { ids, x, y, target: f && !sel.includes(f as never) ? refOf(f) : null } });
  }
  return issueAction(app, { type: 'move', payload: { ids, x, y } });
}

/** Tap on one of your settlements: show its town card. */
export function townAt(app: App, x: number, y: number): number {
  const w = app.world;
  if (!w) return -1;
  for (const s of w.slots[app.ctl].settlements) if (s.hp > 0 && Math.abs(s.x - x) < 14 && Math.abs(s.y - y) < 12) return s.id;
  return -1;
}

/** Double tap on a unit: select every unit of that type on screen. */
export function selectTypeOnScreen(app: App, type: string): number {
  const w = app.world;
  if (!w) return 0;
  const c = app.cam, x0 = c.x, y0 = c.y, x1 = c.x + c.vw / c.zoom, y1 = c.y + c.vh / c.zoom;
  app.selection.clear();
  for (const u of w.units) if (u.team === app.ctl && u.hp > 0 && u.type === type && u.x >= x0 && u.x <= x1 && u.y >= y0 && u.y <= y1) app.selection.add(u.id);
  say(app, app.selection.size + ' selected', 1);
  return app.selection.size;
}

/** A gate under the point toggles. Returns true when it did. */
export function gateAt(app: App, x: number, y: number): boolean {
  const w = app.world;
  if (!w) return false;
  const gb = ownGateAt(w, app.ctl, x, y);
  if (!gb) return false;
  issueAction(app, { type: 'gate', payload: { id: gb.id } });
  return true;
}

/** Touch tap: pick a unit, toggle a gate, or order the selection. The prototype's rule. */
export function tapAt(app: App, x: number, y: number): void {
  const w = app.world;
  if (!w) return;
  // An armed mode with a selection takes the tap, whatever is under it.
  if (app.stance !== 'none' && selectedUnits(app).length) { orderAt(app, x, y); return; }
  const own = unitAt(w, app.ctl, x, y, hitR(app));
  if (own && TYPES[own.type].capacity && !app.selection.has(own.id)) {
    // Ground units selected, tapping your own transport: they get in.
    const riders = selectedUnits(app).filter((u) => !TYPES[u.type].capacity && !TYPES[u.type].naval && !TYPES[u.type].fly && TYPES[u.type].role !== 'civ');
    if (riders.length) { issueAction(app, { type: 'board', payload: { ids: riders.map((u) => u.id), transport: own.id } }); return; }
  }
  if (own) {
    const now = performance.now();
    if (app.lastTap.id === own.id && now - app.lastTap.t < 350) { selectTypeOnScreen(app, own.type); app.lastTap = { id: -1, t: 0 }; app.ui.updateUI(); return; }
    app.lastTap = { id: own.id, t: now };
    selectAt(app, x, y);
    app.ui.updateUI();
    return;
  }
  if (gateAt(app, x, y)) return;
  const hasUnits = selectedUnits(app).length > 0;
  // With units selected: enemies and open ground take orders; your own buildings and towns switch the selection.
  if (hasUnits && !hostileAt(w, app.ctl, x, y) && !foreignAt(w, app.ctl, x, y)) {
    const own = ownThingAt(app, x, y);
    if (own) { app.selection.clear(); app.stance = 'none'; app.warAsk = null; pickThing(app, own); return; }
  }
  if (hasUnits) { orderAt(app, x, y); return; }
  // Nothing selected: pick what is under the finger, or clear the cards on empty ground.
  const thing = ownThingAt(app, x, y) ?? foreignThingAt(app, x, y);
  if (thing) { pickThing(app, thing); return; }
  const had = app.town >= 0 || app.bld >= 0 || !!app.foreign;
  clearSelection(app);
  app.ui.updateUI();
  if (!had) say(app, 'Tap a unit to select it, or drag a box', 1.5);
}

type Thing = { kind: 'town'; id: number } | { kind: 'bld'; id: number } | { kind: 'foreign'; team: number; id: number };

function ownThingAt(app: App, x: number, y: number): Thing | null {
  const w = app.world!;
  const t = townAt(app, x, y);
  if (t >= 0) return { kind: 'town', id: t };
  const b = bldAtPx(w, x, y);
  if (b && b.team === app.ctl && b.kind !== 'trap') return { kind: 'bld', id: b.id };
  return null;
}

function foreignThingAt(app: App, x: number, y: number): Thing | null {
  const st = settleAt(app.world!, x, y);
  if (st && st.team !== app.ctl) return { kind: 'foreign', team: st.team, id: st.id };
  return null;
}

/** Select a town, building, or another side's settlement. Tapping the selected one again clears it. */
function pickThing(app: App, t: Thing): void {
  const same = (t.kind === 'town' && app.town === t.id) || (t.kind === 'bld' && app.bld === t.id) || (t.kind === 'foreign' && app.foreign?.id === t.id);
  clearSelection(app);
  if (!same) {
    if (t.kind === 'town') app.town = t.id;
    else if (t.kind === 'bld') app.bld = t.id;
    else app.foreign = { team: t.team, id: t.id };
    synth.play('select');
  }
  app.ui.updateUI();
}

export interface ToolState { lt: number; lx: number; ly: number }

/** Finish a footprint placement at the last aimed point. */
export function placeRelease(app: App): void {
  if (!app.placing || app.tool !== 'build') return;
  const { x, y } = app.placing;
  app.placing = null;
  const w = app.world!;
  if (issueAction(app, { type: 'build', payload: { x, y, bld: app.bbrush } })) {
    app.lastBuilt = [w.blds[w.blds.length - 1].id];
    // A big building places once and puts the tool away. Walls, roads, and cheap pieces stay armed.
    if (BLD[app.bbrush].cost >= 100 || BLD[app.bbrush].w * BLD[app.bbrush].h >= 4) { app.tool = 'cmd'; app.ui.updateUI(); }
  }
}

/** The footprint preview for the HUD: where the building would go and whether it fits. */
export function placePreview(app: App): { tx: number; ty: number; w: number; h: number; ok: boolean } | null {
  const w = app.world;
  if (!w || app.tool !== 'build') return null;
  const p = app.placing ?? (app.mouse ? { x: app.cam.x + app.mouse.x / app.cam.zoom, y: app.cam.y + app.mouse.y / app.cam.zoom } : null);
  if (!p) return null;
  const D = BLD[app.bbrush];
  const tx = clamp(Math.round(p.x / TILE - D.w / 2), 0, w.map.cols - 1), ty = clamp(Math.round(p.y / TILE - D.h / 2), 0, w.map.rows - 1);
  return { tx, ty, w: D.w, h: D.h, ok: !canBuild(w, tx, ty, app.ctl, app.bbrush) };
}

/** Editor painting, building, selling, and sandbox placement. Returns true when a tool took the pointer. */
/**
 * Paint every tile from the last painted one to here, stepping through neighbors so a fast drag
 * leaves a connected line: first across, then down. Holes in walls let armies through.
 */
function paintLine(app: App, ts: ToolState, x: number, y: number, first: boolean, put: (px: number, py: number) => void): void {
  const w = app.world!;
  const tx = clamp((x / TILE) | 0, 0, w.map.cols - 1), ty = clamp((y / TILE) | 0, 0, w.map.rows - 1), i = ty * w.map.cols + tx;
  if (ts.lt === i) return;
  if (first || ts.lt < 0) { ts.lt = i; put(tx * TILE + 4, ty * TILE + 4); return; }
  let cx = ts.lt % w.map.cols, cy = (ts.lt / w.map.cols) | 0;
  let guard = w.map.cols + w.map.rows;
  while ((cx !== tx || cy !== ty) && guard-- > 0) {
    if (cx !== tx) cx += Math.sign(tx - cx); else cy += Math.sign(ty - cy);
    put(cx * TILE + 4, cy * TILE + 4);
  }
  ts.lt = i;
}

export function toolAt(app: App, x: number, y: number, ts: ToolState, first: boolean): boolean {
  if (app.editor) { paint(app, x, y, ts); return true; }
  const w = app.world;
  if (!w) return false;
  if (app.tool === 'build') {
    const D = BLD[app.bbrush];
    if (first) app.lastBuilt = [];
    // Footprint buildings: drag to aim, release to place. Walls and bridges paint as you drag.
    if (D.w > 1 || D.h > 1 || D.kind === 'town') { app.placing = { x, y }; return true; }
    paintLine(app, ts, x, y, first, (px, py) => {
      if (issueAction(app, { type: 'build', payload: { x: px, y: py, bld: app.bbrush } })) app.lastBuilt.push(w.blds[w.blds.length - 1].id);
    });
    return true;
  }
  if (app.tool === 'terrain') {
    paintLine(app, ts, x, y, first, (px, py) => issueAction(app, { type: 'terrain', payload: { x: px, y: py, kind: app.tbrush } }));
    return true;
  }
  if (app.tool === 'sell') {
    // Remove paints: drag across walls and roads, tap a building.
    paintLine(app, ts, x, y, first, (px, py) => issueAction(app, { type: 'sell', payload: { x: px, y: py } }));
    return true;
  }
  if (app.tool === 'settle' || app.tool === 'outpost') {
    if (first) { if (issueAction(app, { type: 'settle', payload: { x, y, tier: app.tool === 'outpost' ? 'outpost' : 'village' } })) { app.tool = 'cmd'; app.ui.updateUI(); } }
    return true;
  }
  if (app.tool === 'absorb') {
    if (first) {
      const w2 = app.world!;
      const b = w2.neutral >= 0 ? w2.slots[w2.neutral].settlements.find((q) => q.hp > 0 && Math.abs(q.x - x) < 16 && Math.abs(q.y - y) < 12) : undefined;
      if (b) { if (issueAction(app, { type: 'absorb', payload: { id: b.id } })) { app.tool = 'cmd'; app.ui.updateUI(); } }
      else say(app, 'Tap an independent village', 1.2);
    }
    return true;
  }
  if (app.tool === 'upgrade') {
    if (first) {
      const w2 = app.world!;
      const b = w2.slots[app.ctl].settlements.find((q) => q.hp > 0 && Math.abs(q.x - x) < 16 && Math.abs(q.y - y) < 12);
      if (b) { issueAction(app, { type: 'upgrade', payload: { id: b.id } }); app.tool = 'cmd'; app.ui.updateUI(); }
      else say(app, 'Tap one of your villages', 1.2);
    }
    return true;
  }
  if (app.tool === 'power') {
    if (first && app.power) {
      const ids = POWERS[app.power].selection ? selectedUnits(app).map((u) => u.id) : undefined;
      if (issueAction(app, { type: 'power', payload: { power: app.power, x, y, ids } })) { app.tool = 'cmd'; app.power = null; app.tab = 'none'; app.ui.updateUI(); }
    }
    return true;
  }
  if (app.tool === 'cheat') {
    if (first) cheatTap(app, x, y);
    return true;
  }
  if (app.tool === 'rally') {
    if (first) { issueAction(app, app.bld >= 0 ? { type: 'bldRally', payload: { id: app.bld, x, y } } : { type: 'rally', payload: { x, y } }); app.tool = 'cmd'; app.ui.updateUI(); }
    return true;
  }
  if (w.phase === 'edit') {
    if (!first && Math.hypot(x - ts.lx, y - ts.ly) < 9) return true;
    ts.lx = x; ts.ly = y;
    if (app.tool === 'erase') { issueAction(app, { type: 'erase', payload: { x, y } }); return true; }
    if (first && gateAt(app, x, y)) return true;
    issueAction(app, { type: 'place', payload: { unit: app.brush, x, y } });
    return true;
  }
  return false;
}

export function usesTool(app: App): boolean {
  return !!app.editor || app.tool !== 'cmd' || app.world?.phase === 'edit';
}

/** Tools that paint while dragging. Everything else applies on a tap and lets a drag pan. */
export function dragTool(app: App): boolean {
  if (app.editor) return true;
  if (app.tool === 'build' || app.tool === 'sell' || app.tool === 'terrain') return true;
  return app.world?.phase === 'edit' && (app.tool === 'place' || app.tool === 'erase');
}
