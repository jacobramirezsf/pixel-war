// Keyboard. Numbers buy from the build strip, Ctrl+number sets a control group, number recalls it,
// Tab cycles unit types in the selection, F focuses the base, Space pauses.

import { roster, TYPES } from '../../data/units.ts';
import { centerOn } from '../../render/camera.ts';
import { unitsOf } from '../../sim/queries.ts';
import { primaryBase } from '../../sim/world.ts';
import { ctlRace, issueAction, say, selectedUnits, type App, clearSelection, saveLayers } from '../app.ts';
import { cancelTool, charge, cycleSpeed, hold, selectAll, togglePause } from '../hud/commands.ts';
import { POWER_KEYS, POWERS } from '../../data/powers.ts';
import { panBy, setZoom } from '../../render/camera.ts';

export const HOTKEYS: [string, string][] = [
  ['1-9, 0', 'buy from the build strip (Shift for the second row)'],
  ['Ctrl+1-9', 'save the selection as a group'],
  ['1-9', 'recall a group when the strip is closed'],
  ['Tab', 'cycle unit types in the selection'],
  ['Ctrl+A', 'select all'], ['C', 'charge'], ['M A G', 'arm move, attack-move, guard, then click'], ['H', 'hold position'], ['Backspace', 'retreat to base'],
  ['F', 'focus your base'], ['Space', 'pause, or hold to drag the view'],
  ['Q W E R T G', 'powers, then click the target'],
  ['B', 'build tab'], ['Y', 'set the rally point'], ['L', 'territory overlay (Conquest)'], ['[ and ]', 'slower, faster'], ['Esc', 'cancel tool, clear selection'],
  ['Right click', 'move or attack'], ['Right drag', 'pan'], ['Scroll', 'pan (trackpad)'], ['Pinch, Ctrl+scroll, + -', 'zoom'], ['Arrows, WASD', 'pan'],
];

/** Held keys pan every frame. */
export function keyPan(app: App, dt: number): void {
  if (!app.world && !app.editor) return;
  const sp = 520 * dt;
  let dx = 0, dy = 0;
  if (app.keys.has('ArrowLeft') || app.keys.has('a') || app.keys.has('A')) dx += sp;
  if (app.keys.has('ArrowRight') || app.keys.has('d') || app.keys.has('D')) dx -= sp;
  if (app.keys.has('ArrowUp') || app.keys.has('w') || app.keys.has('W')) dy += sp;
  if (app.keys.has('ArrowDown') || app.keys.has('s') || app.keys.has('S')) dy -= sp;
  if (dx || dy) panBy(app.cam, dx, dy);
}

/** HOME: the capital first, then each further town in turn while the camera is already on one. */
export function focusBase(app: App): void {
  const w = app.world;
  if (!w) return;
  const towns = w.slots[app.ctl].settlements.filter((b) => b.hp > 0);
  if (!towns.length) return;
  const cap = towns.find((b) => w.capitals[app.ctl] === b.region) ?? primaryBase(w, app.ctl);
  const cx = app.cam.x + app.cam.vw / app.cam.zoom / 2, cy = app.cam.y + app.cam.vh / app.cam.zoom / 2;
  const here = towns.findIndex((b) => Math.hypot(b.x - cx, b.y - cy) < 24);
  const order = [cap, ...towns.filter((b) => b !== cap)];
  const at = here >= 0 ? order.indexOf(towns[here]) : -1;
  const b = order[(at + 1) % order.length];
  centerOn(app.cam, b.x, b.y);
  if (order.length > 1 && w.mode === 'conquest') say(app, (w.regions[b.region]?.name ?? 'Home') + (b === cap ? ' (capital)' : ''), 1);
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
    if (k === 'Escape') { if (app.tool !== 'cmd' && !(w.phase === 'edit' && app.tool === 'place')) cancelTool(app); else if (app.stance !== 'none' || app.warAsk) { app.stance = 'none'; app.warAsk = null; } else clearSelection(app); app.drag = null; app.ui.updateUI(); return; }
    if (k === 'Backspace') { e.preventDefault(); retreat(app); return; }
    if (k === '+' || k === '=') { setZoom(app.cam, app.cam.zoom + 1); return; }
    if (k === '-' || k === '_') { setZoom(app.cam, app.cam.zoom - 1); return; }
    if (k === '[') { cycleSpeed(app, -1); return; }
    if (k === ']') { cycleSpeed(app, 1); return; }
    if (k.startsWith('Arrow')) { e.preventDefault(); return; }
    const pk = POWER_KEYS.find((p) => POWERS[p].hotkey.toLowerCase() === k.toLowerCase());
    if (pk && !e.ctrlKey && !e.metaKey && w.phase === 'play') { app.tool = 'power'; app.power = pk; app.tab = 'powers'; app.ui.updateUI(); say(app, POWERS[pk].name + ': click the target', 1.5); return; }
    if (/^[0-9]$/.test(k)) {
      const n = k === '0' ? 10 : +k;
      if (e.ctrlKey || e.metaKey) { e.preventDefault(); setGroup(app, n); return; }
      if (w.mode !== 'sand' && app.groups.has(n) && app.tab !== 'units' && app.tab !== 'build') { recallGroup(app, n); return; }
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
    else if (lk === 'c') charge(app);
    else if (lk === 'm' || lk === 'g' || (lk === 'a' && !e.ctrlKey && !e.metaKey)) { const st = lk === 'm' ? 'move' : lk === 'g' ? 'guard' : 'attack'; app.stance = app.stance === st ? 'none' : st; app.ui.updateUI(); say(app, app.stance === 'none' ? 'Cancelled' : st.toUpperCase() + ': click the target', 1.5); }
    else if (lk === 'h') hold(app);
    else if (lk === 'f') focusBase(app);
    else if (lk === 'y') { app.tool = app.tool === 'rally' ? 'cmd' : 'rally'; app.ui.updateUI(); }
    else if (lk === 'l' && w.mode === 'conquest') { app.layers.territory = !app.layers.territory; saveLayers(app); app.ui.updateUI(); }
    else if (lk === 'b') { app.tab = app.tab === 'build' ? 'units' : 'build'; app.tool = app.tab === 'build' ? 'build' : w.phase === 'edit' ? 'place' : 'cmd'; app.ui.updateUI(); }
    else if (lk === 'a' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); selectAll(app); }
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
