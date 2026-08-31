// The command grid under the build strip.

import { TNAME } from '../../data/teams.ts';
import { TYPES } from '../../data/units.ts';
import { unitsOf } from '../../sim/queries.ts';
import { recallGroup, retreat, setGroup } from '../input/hotkeys.ts';
import { hideOverlay, issueAction, leaveEditor, openEditor, say, selectedUnits, type App } from '../app.ts';
import { saveConquest } from '../conquest.ts';
import { $, on } from '../dom.ts';

export function selectAll(app: App): void {
  const w = app.world;
  if (!w) return;
  app.selection.clear();
  for (const u of unitsOf(w, app.ctl)) app.selection.add(u.id);
  const n = app.selection.size;
  say(app, n ? 'All ' + n + ' selected' : 'No units yet', 1.2);
}

/** Selected units attack-move. With nothing selected, the whole army goes. */
export function charge(app: App): void {
  const w = app.world;
  if (!w) return;
  let sel = selectedUnits(app);
  if (!sel.length) sel = unitsOf(w, app.ctl);
  if (!sel.length) { say(app, 'No units to send', 1.2); return; }
  issueAction(app, { type: 'attack', payload: { ids: sel.map((u) => u.id), target: null } });
}

export function hold(app: App): void {
  const ids = selectedUnits(app).map((u) => u.id);
  issueAction(app, { type: 'hold', payload: { ids } });
}

export function togglePause(app: App): void {
  app.paused = !app.paused;
  say(app, app.paused ? 'Paused. You can still give orders.' : 'Resumed', 1.5);
  app.ui.updateUI();
}

export function wireCommands(app: App): void {
  const live = (): boolean => app.running && !!app.world;
  on($('bAll'), 'click', () => { if (live()) selectAll(app); });
  on($('bCharge'), 'click', () => { if (live()) charge(app); });
  on($('bHold'), 'click', () => { if (live()) hold(app); });
  on($('bRetreat'), 'click', () => { if (live()) retreat(app); });
  on($('bRally'), 'click', () => {
    if (!live() || !app.world) return;
    if (app.tool === 'rally') { app.tool = 'cmd'; app.ui.updateUI(); return; }
    if (app.world.slots[app.ctl].rally && !selectedUnits(app).length) { issueAction(app, { type: 'rally', payload: null }); app.ui.updateUI(); return; }
    app.tool = 'rally';
    app.ui.updateUI();
    say(app, 'Tap the map to set where new units gather', 2);
  });
  const toolToggle = (tool: 'settle' | 'outpost' | 'upgrade' | 'absorb', hint: string): void => {
    if (!live()) return;
    app.tool = app.tool === tool ? 'cmd' : tool;
    app.ui.updateUI();
    if (app.tool === tool) say(app, hint, 2.5);
  };
  on($('bSettle'), 'click', () => toolToggle('settle', 'Tap open ground in a region next to yours. 150 gold, 50 materials. Hold it 30s to claim.'));
  on($('bOutpost'), 'click', () => toolToggle('outpost', 'Tap open ground next to your land. 50 gold, 20 materials, claims but makes nothing.'));
  on($('bFort'), 'click', () => toolToggle('upgrade', 'Tap a settlement of yours to grow it: outpost, village, fortress, city. Weak while it builds.'));
  on($('bAbsorb'), 'click', () => toolToggle('absorb', 'Tap an independent village with your units beside it. 200 gold, it joins intact.'));
  on($('bTerr'), 'click', () => { app.terrOpen = !app.terrOpen; app.ui.updateUI(); });
  on($('bSave'), 'click', () => { say(app, saveConquest(app) ? 'Saved' : 'Nothing to save', 1.2); });
  on($('bLand'), 'click', () => { app.overlay = !app.overlay; app.ui.updateUI(); });
  on($('bSpeed'), 'click', () => { app.speed = app.speed >= 4 ? 1 : app.speed * 2; app.ui.updateUI(); });
  // Mobile groups: tap recalls, tap with a selection and an empty slot saves, hold saves over.
  for (const n of [1, 2, 3]) {
    const b = $('bG' + n);
    let downAt = 0;
    on(b, 'pointerdown', () => { downAt = performance.now(); });
    on(b, 'click', () => {
      if (!live()) return;
      const long = performance.now() - downAt > 450;
      const has = app.groups.has(n);
      if (long || (!has && selectedUnits(app).length)) setGroup(app, n);
      else if (has) recallGroup(app, n);
      else say(app, 'Select units, then tap G' + n + ' to save them', 1.5);
      app.ui.updateUI();
    });
  }
  on($('bTeam'), 'click', () => {
    const x = app.world;
    app.ctl = 1 - app.ctl;
    app.selection.clear();
    app.ui.updateUI();
    say(app, (x?.phase === 'edit' ? 'Placing ' : 'Commanding ') + TNAME[app.ctl], 1.2);
  });
  on($('bErase'), 'click', () => {
    app.tool = app.tool === 'erase' ? 'place' : 'erase';
    app.bstrip = false;
    app.ui.updateUI();
    say(app, app.tool === 'erase' ? 'Tap units or buildings to remove them' : 'Placing ' + TYPES[app.brush].name, 1.5);
  });
  on($('bClear'), 'click', () => issueAction(app, { type: 'clear', payload: null }));
  on($('bMirror'), 'click', () => issueAction(app, { type: 'mirror', payload: null }));
  on($('bPause'), 'click', () => { if (app.world) togglePause(app); });
  on($('bPlay'), 'click', () => startBattle(app));
  on($('bEdit'), 'click', () => toEdit(app));
  on($('bMap'), 'click', () => openEditor(app, 'sand'));
  on($('bMenu'), 'click', () => { if (app.editor) leaveEditor(app); else app.ui.showMenu(); });
}

export function startBattle(app: App): void {
  if (!app.world || !issueAction(app, { type: 'startBattle', payload: null })) return;
  app.tool = 'cmd';
  app.bstrip = false;
  app.running = true;
  app.paused = false;
  app.selection.clear();
  hideOverlay();
  app.ui.updateUI();
}

export function toEdit(app: App): void {
  if (!app.world) return;
  issueAction(app, { type: 'toEdit', payload: null });
  app.selection.clear();
  app.paused = false;
  app.tool = 'place';
  app.bstrip = false;
  app.drag = null;
  app.running = true;
  hideOverlay();
  app.ui.updateUI();
}
