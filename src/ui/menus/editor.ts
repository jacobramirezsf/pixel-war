// Map editor buttons and painting.

import { SIZES } from '../../data/maps.ts';
import { buildBg } from '../../render/terrain.ts';
import { clamp, clearMap, finishMap, mirrorMap, moveBase, paintTile, resizeMap, TILE, toggleMine } from '../../sim/map.ts';
import { randomMap } from '../../sim/mapgen.ts';
import { realmMap } from '../../sim/realmgen.ts';
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
    say(app, 'Random map, mirrored', 1);
  });
  on($('bWild'), 'click', () => {
    if (!app.editor) return;
    const m = app.editor.map;
    // Realm-style: asymmetric geography sized to the current map, bases in opposite corners.
    const grid = Math.max(3, Math.min(5, Math.round(Math.max(m.cols, m.rows) / 16)));
    const g = realmMap((Math.random() * 2 ** 31) | 0, grid, 1).map;
    setEditorMap(app, resizeMap(g, m.cols, m.rows));
    say(app, 'Wild map: forests, ridges, a river with fords', 1.5);
  });
  on($('bBrush'), 'click', () => {
    if (!app.editor) return;
    app.editor.brush = (app.editor.brush % 3) + 1;
    $('bBrush').textContent = 'BRUSH ' + app.editor.brush;
    say(app, 'Brush ' + app.editor.brush + 'x' + app.editor.brush, 1);
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
  const k = app.editor.tool, b = app.editor.brush;
  let why: string | null = null;
  if (typeof k === 'number') {
    // Terrain paints a brush-sized square centered on the tile. Base ground is skipped quietly.
    const off = Math.floor((b - 1) / 2);
    for (let dy = 0; dy < b; dy++) for (let dx = 0; dx < b; dx++) {
      const px = tx - off + dx, py = ty - off + dy;
      if (px < 0 || py < 0 || px >= m.cols || py >= m.rows) continue;
      const r = paintTile(m, px, py, k);
      if (r && b === 1) why = r;
    }
  }
  else if (k === 'mine') why = toggleMine(m, tx, ty);
  else moveBase(m, +k[1], tx, ty);
  if (why) { say(app, why, 1); return; }
  buildBg(m, app.bg);
}
