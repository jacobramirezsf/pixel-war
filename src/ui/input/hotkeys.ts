// Keyboard. Numbers buy from the build strip, Ctrl+number sets a control group, number recalls it,
// Tab cycles unit types in the selection, F focuses the base, Space pauses.

import { roster, TYPES } from '../../data/units.ts';
import { centerOn } from '../../render/camera.ts';
import { unitsOf } from '../../sim/queries.ts';
import { primaryBase } from '../../sim/world.ts';
import { ctlRace, issueAction, say, selectedUnits, type App } from '../app.ts';
import { charge, hold, selectAll, togglePause } from '../hud/commands.ts';

export const HOTKEYS: [string, string][] = [
  ['1-9, 0', 'buy from the build strip (Shift for the second row)'],
  ['Ctrl+1-9', 'save the selection as a group'],
  ['1-9', 'recall a group when the strip is closed'],
  ['Tab', 'cycle unit types in the selection'],
  ['A', 'select all'], ['C', 'charge'], ['H', 'hold'], ['R', 'retreat to base'],
  ['F', 'focus your base'], ['Space', 'pause, or hold to drag the view'],
  ['B', 'open or close the build strip'], ['Esc', 'clear selection'],
  ['Right click', 'move or attack'], ['Wheel', 'zoom'], ['Middle drag', 'pan'],
];

export function focusBase(app: App): void {
  const w = app.world;
  if (!w) return;
  const b = primaryBase(w, app.ctl);
  centerOn(app.cam, b.x, b.y);
}

export function setGroup(app: App, n: number): void {
  const ids = selectedUnits(app).map((u) => u.id);
  if (!ids.length) return;
  app.groups.set(n, new Set(ids));
  say(app, 'Group ' + n + ' set (' + ids.length + ')', 1.2);
}

export function recallGroup(app: App, n: number): boolean {
  const g = app.groups.get(n);
  const w = app.world;
  if (!g || !w) return false;
  app.selection.clear();
  for (const u of w.units) if (g.has(u.id) && u.hp > 0) app.selection.add(u.id);
  if (!app.selection.size) { say(app, 'Group ' + n + ' is gone', 1.2); return true; }
  say(app, 'Group ' + n + ': ' + app.selection.size, 1);
  return true;
}

/** Narrow the selection to the next unit type it contains. */
export function cycleType(app: App): void {
  const sel = selectedUnits(app);
  if (!sel.length) return;
  const types = [...new Set(sel.map((u) => u.type))];
  const w = app.world!;
  const all = unitsOf(w, app.ctl);
  const curAll = types.length === 1 ? types[0] : null;
  // With a mixed selection, narrow to the first type. With one type, move to the next type the army has.
  const armyTypes = [...new Set(all.map((u) => u.type))];
  let next = types[0];
  if (curAll) { const i = armyTypes.indexOf(curAll); next = armyTypes[(i + 1) % armyTypes.length]; }
  app.selection.clear();
  for (const u of all) if (u.type === next) app.selection.add(u.id);
  say(app, TYPES[next].name + ' ×' + app.selection.size, 1);
}

export function retreat(app: App): void {
  const w = app.world;
  if (!w) return;
  const sel = selectedUnits(app);
  if (!sel.length) return;
  issueAction(app, { type: 'retreat', payload: { ids: sel.map((u) => u.id) } });
}

export function wireHotkeys(app: App): void {
  window.addEventListener('keydown', (e) => {
    app.keys.add(e.key);
    if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
    if (!app.world || !app.running) return;
    const w = app.world;
    const k = e.key;
    if (k === ' ') { e.preventDefault(); if (!e.repeat) app.spaceT = performance.now(); return; }
    if (k === 'Escape') { app.selection.clear(); app.drag = null; return; }
    if (/^[0-9]$/.test(k)) {
      const n = k === '0' ? 10 : +k;
      if (e.ctrlKey || e.metaKey) { e.preventDefault(); setGroup(app, n); return; }
      if (w.mode !== 'sand' && (app.groups.has(n) && !app.bstrip)) { recallGroup(app, n); return; }
      const list = roster(ctlRace(app));
      const idx = (e.shiftKey ? 10 : 0) + n - 1;
      const unit = list[idx];
      if (!unit) return;
      if (w.mode === 'sand') { app.brush = unit; app.tool = 'place'; app.ui.updateUI(); return; }
      issueAction(app, { type: 'buy', payload: { unit } });
      return;
    }
    const lk = k.toLowerCase();
    if (lk === 'tab') { e.preventDefault(); cycleType(app); }
    else if (lk === 'a') selectAll(app);
    else if (lk === 'c') charge(app);
    else if (lk === 'h') hold(app);
    else if (lk === 'r') retreat(app);
    else if (lk === 'f') focusBase(app);
    else if (lk === 'b') { app.bstrip = !app.bstrip; app.tool = app.bstrip ? 'build' : w.phase === 'edit' ? 'place' : 'cmd'; app.ui.updateUI(); }
  });
  window.addEventListener('keyup', (e) => {
    app.keys.delete(e.key);
    if (e.key === ' ' && app.world && app.running) {
      // A short tap pauses. Holding space is the drag-to-pan modifier.
      if (performance.now() - app.spaceT < 250 && !app.spaceDragged) togglePause(app);
      app.spaceDragged = false;
    }
  });
  window.addEventListener('blur', () => app.keys.clear());
}
