// What a pointer means in world coordinates, independent of how it got there.
// Touch and mouse both end up here. Everything that changes the sim goes out as a command.

import { refOf } from '../../sim/commands.ts';
import { clamp, TILE } from '../../sim/map.ts';
import { hostileAt, ownGateAt, unitAt } from '../../sim/queries.ts';
import { issueAction, say, selectedUnits, type App } from '../app.ts';
import { paint } from '../menus/editor.ts';

export interface Rect { x: number; y: number; w: number; h: number }

export function boxSelect(app: App, d: Rect, additive = false): void {
  const w = app.world;
  if (!w) return;
  if (!additive) app.selection.clear();
  for (const u of w.units) if (u.team === app.ctl && u.hp > 0 && u.x >= d.x && u.x <= d.x + d.w && u.y >= d.y && u.y <= d.y + d.h) app.selection.add(u.id);
  const n = app.selection.size;
  say(app, n ? n + ' selected' : 'No units there', 1.2);
}

/** Select the own unit at a point. Returns true when there was one. */
export function selectAt(app: App, x: number, y: number, additive = false): boolean {
  const w = app.world;
  if (!w) return false;
  const own = unitAt(w, app.ctl, x, y);
  if (!own) { if (!additive) app.selection.clear(); return false; }
  if (additive) { if (app.selection.has(own.id)) app.selection.delete(own.id); else app.selection.add(own.id); return true; }
  const only = app.selection.has(own.id) && selectedUnits(app).length === 1;
  app.selection.clear();
  if (!only) app.selection.add(own.id);
  return true;
}

/** Order the selection to a point: attack what is there, otherwise move. */
export function orderAt(app: App, x: number, y: number): boolean {
  const w = app.world;
  if (!w) return false;
  const sel = selectedUnits(app);
  if (!sel.length) { say(app, 'Select units first: tap one or drag a box', 2); return false; }
  const ids = sel.map((u) => u.id);
  const en = hostileAt(w, app.ctl, x, y);
  if (en) return issueAction(app, { type: 'attack', payload: { ids, target: refOf(en) } });
  return issueAction(app, { type: 'move', payload: { ids, x, y } });
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
  if (unitAt(w, app.ctl, x, y)) { selectAt(app, x, y); return; }
  if (gateAt(app, x, y)) return;
  orderAt(app, x, y);
}

export interface ToolState { lt: number; lx: number; ly: number }

/** Editor painting, building, selling, and sandbox placement. Returns true when a tool took the pointer. */
export function toolAt(app: App, x: number, y: number, ts: ToolState, first: boolean): boolean {
  if (app.editor) { paint(app, x, y, ts); return true; }
  const w = app.world;
  if (!w) return false;
  if (app.tool === 'build') {
    const tx = clamp((x / TILE) | 0, 0, w.map.cols - 1), ty = clamp((y / TILE) | 0, 0, w.map.rows - 1), i = ty * w.map.cols + tx;
    if (ts.lt === i) return true;
    ts.lt = i;
    issueAction(app, { type: 'build', payload: { x, y, bld: app.bbrush } });
    return true;
  }
  if (app.tool === 'sell') { if (first) issueAction(app, { type: 'sell', payload: { x, y } }); return true; }
  if (app.tool === 'settle') {
    if (first) { if (issueAction(app, { type: 'settle', payload: { x, y } })) { app.tool = 'cmd'; app.ui.updateUI(); } }
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
  if (app.tool === 'rally') {
    if (first) { issueAction(app, { type: 'rally', payload: { x, y } }); app.tool = 'cmd'; app.ui.updateUI(); }
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
  return !!app.editor || app.tool === 'build' || app.tool === 'sell' || app.tool === 'rally' || app.tool === 'settle' || app.tool === 'upgrade' || app.world?.phase === 'edit';
}
