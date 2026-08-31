// The command grid under the build strip.

import { TNAME } from '../../data/teams.ts';
import { TYPES } from '../../data/units.ts';
import * as C from '../../sim/commands.ts';
import { hideOverlay, leaveEditor, openEditor, say, type App } from '../app.ts';
import { $, on } from '../dom.ts';

export function wireCommands(app: App): void {
  const w = (): import('../../sim/types.ts').World | null => (app.running ? app.world : null);
  on($('bAll'), 'click', () => { const x = w(); if (x) C.selectAll(x, app.ctl); });
  on($('bCharge'), 'click', () => { const x = w(); if (x) C.charge(x, app.ctl); });
  on($('bHold'), 'click', () => { const x = w(); if (x) C.hold(x); });
  on($('bTeam'), 'click', () => {
    const x = app.world;
    app.ctl = 1 - app.ctl;
    if (x) C.clearSelection(x);
    app.ui.updateUI();
    say(app, (x?.phase === 'edit' ? 'Placing ' : 'Commanding ') + TNAME[app.ctl], 1.2);
  });
  on($('bErase'), 'click', () => {
    app.tool = app.tool === 'erase' ? 'place' : 'erase';
    app.bstrip = false;
    app.ui.updateUI();
    say(app, app.tool === 'erase' ? 'Tap units or buildings to remove them' : 'Placing ' + TYPES[app.brush].name, 1.5);
  });
  on($('bClear'), 'click', () => { const x = app.world; if (x) C.clearAll(x); });
  on($('bMirror'), 'click', () => { const x = app.world; if (x) C.mirror(x, app.ctl); });
  on($('bPause'), 'click', () => { const x = app.world; if (x) { C.togglePause(x); app.ui.updateUI(); } });
  on($('bPlay'), 'click', () => {
    const x = app.world;
    if (!x || !C.startBattle(x)) return;
    app.tool = 'cmd';
    app.bstrip = false;
    app.running = true;
    hideOverlay();
    app.ui.updateUI();
  });
  on($('bEdit'), 'click', () => toEdit(app));
  on($('bMap'), 'click', () => openEditor(app, 'sand'));
  on($('bMenu'), 'click', () => { if (app.editor) leaveEditor(app); else app.ui.showMenu(); });
}

export function toEdit(app: App): void {
  const x = app.world;
  if (!x) return;
  C.toEdit(x);
  app.tool = 'place';
  app.bstrip = false;
  app.drag = null;
  app.running = true;
  hideOverlay();
  app.ui.updateUI();
}
