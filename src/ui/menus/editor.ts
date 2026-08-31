// Map editor buttons and painting.

import { SIZES } from '../../data/maps.ts';
import { buildBg } from '../../render/terrain.ts';
import { clamp, clearMap, finishMap, mirrorMap, moveBase, paintTile, resizeMap, TILE, toggleMine } from '../../sim/map.ts';
import { randomMap } from '../../sim/mapgen.ts';
import { connected } from '../../sim/pathing.ts';
import { makeRng } from '../../sim/rng.ts';
import { leaveEditor, say, setEditorMap, type App } from '../app.ts';
import { $, on } from '../dom.ts';
import { showCode } from './menu.ts';

export function wireEditor(app: App): void {
  on($('bSize'), 'click', () => {
    if (!app.editor) return;
    const m = app.editor.map;
    let i = SIZES.findIndex((s) => s[1] === m.cols && s[2] === m.rows);
    i = (i + 1) % SIZES.length;
    const [nm, c, r] = SIZES[i];
    setEditorMap(app, resizeMap(m, c, r));
    say(app, 'Size ' + nm + ': ' + c + '×' + r, 1.5);
  });
  on($('bRandom'), 'click', () => {
    if (!app.editor) return;
    const m = app.editor.map;
    setEditorMap(app, randomMap(m.cols, m.rows, makeRng((Math.random() * 2 ** 31) | 0)));
    say(app, 'Random map', 1);
  });
  on($('bMirrorMap'), 'click', () => {
    if (!app.editor) return;
    mirrorMap(app.editor.map);
    buildBg(app.editor.map, app.bg);
    say(app, 'Bottom half now mirrors the top', 1.5);
  });
  on($('bClearMap'), 'click', () => {
    if (!app.editor) return;
    clearMap(app.editor.map);
    buildBg(app.editor.map, app.bg);
    say(app, 'Cleared to grass', 1);
  });
  on($('bCode'), 'click', () => showCode(app));
  on($('bDone'), 'click', () => {
    if (!app.editor) return;
    const m = finishMap(app.editor.map);
    if (!connected(m)) { say(app, 'Red base cannot reach blue base. Open a path.', 3); return; }
    app.custom = m;
    app.curMap = m;
    leaveEditor(app);
  });
}

/** Paint one tile under a pointer. `last` is the previous tile index so drags do not repeat. */
export function paint(app: App, x: number, y: number, last: { lt: number }): void {
  if (!app.editor) return;
  const m = app.editor.map, tx = clamp((x / TILE) | 0, 0, m.cols - 1), ty = clamp((y / TILE) | 0, 0, m.rows - 1), i = ty * m.cols + tx;
  if (last.lt === i) return;
  last.lt = i;
  const k = app.editor.tool;
  let why: string | null = null;
  if (typeof k === 'number') why = paintTile(m, tx, ty, k);
  else if (k === 'mine') why = toggleMine(m, tx, ty);
  else moveBase(m, +k[1], tx, ty);
  if (why) { say(app, why, 1); return; }
  buildBg(m, app.bg);
}
