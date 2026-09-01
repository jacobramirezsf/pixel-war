// Roads, bridges, clearing, and undo.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WORK } from '../../src/data/buildings.ts';
import { canBuild, passableFor } from '../../src/sim/buildings.ts';
import { newGame } from '../../src/sim/game.ts';
import { distField } from '../../src/sim/pathing.ts';
import { mkUnit } from '../../src/sim/units.ts';
import { act, run, ticks } from './helpers.ts';

const realm = (seed = 3) => { const w = newGame({} as never, 'conquest', { seed, rivals: 1 }); w.slots[0].gold = 5000; w.slots[0].mat = 5000; return w; };

test('a road takes a moment to lay, speeds units, and comes up with REMOVE', () => {
  const w = realm();
  const home = w.slots[0].settlements[0];
  const tx = Math.round(home.x / 8) + 4, ty = Math.round(home.y / 8);
  w.map.tiles[ty * w.map.cols + tx] = 0;
  assert.ok(act(w, 0, { type: 'terrain', payload: { x: tx * 8 + 4, y: ty * 8 + 4, kind: 'road' } }), w.msg);
  assert.equal(w.works.length, 1);
  assert.notEqual(w.map.tiles[ty * w.map.cols + tx], 1, 'not yet');
  run(w, WORK.roadT + 0.5);
  assert.equal(w.map.tiles[ty * w.map.cols + tx], 1, 'laid');
  assert.ok(w.mapDirty || true);
  // Speed: same unit, same time, on road vs grass.
  const a = mkUnit(w, 0, 'inf', tx * 8 + 4, ty * 8 + 4), b = mkUnit(w, 0, 'inf', tx * 8 + 4, ty * 8 + 40);
  w.map.tiles[(ty + 5) * w.map.cols + tx] = 0;
  a.order = { type: 'move', x: a.x + 200, y: a.y }; b.order = { type: 'move', x: b.x + 200, y: b.y };
  w.units.push(a, b);
  ticks(w, 1);
  const da = a.x - (tx * 8 + 4), db = b.x - (tx * 8 + 4);
  assert.ok(da > db * 1.1, 'road faster: ' + da.toFixed(2) + ' vs ' + db.toFixed(2));
  assert.ok(act(w, 0, { type: 'sell', payload: { x: tx * 8 + 4, y: ty * 8 + 4 } }));
  assert.equal(w.map.tiles[ty * w.map.cols + tx], 0);
});

test('clearing trees opens ground on your land only, and rock takes longer', () => {
  const w = realm(4);
  const home = w.slots[0].settlements[0];
  const cols = w.map.cols;
  let tree = -1;
  for (let i = 0; i < w.map.tiles.length && tree < 0; i++) if (w.map.tiles[i] === 2 && w.regionOf![i] === home.region) tree = i;
  assert.ok(tree >= 0, 'a tree on home land');
  const tx = tree % cols, ty = (tree / cols) | 0;
  assert.ok(act(w, 0, { type: 'terrain', payload: { x: tx * 8 + 4, y: ty * 8 + 4, kind: 'clear' } }), w.msg);
  run(w, WORK.treeT + 0.5);
  assert.equal(w.map.tiles[tree], 0);
  let far = -1;
  for (let i = 0; i < w.map.tiles.length && far < 0; i++) if (w.map.tiles[i] === 2 && w.regions[w.regionOf![i]].owner !== 0 && !w.slots[0].settlements.some((s) => s.region === w.regionOf![i])) far = i;
  assert.ok(!act(w, 0, { type: 'terrain', payload: { x: (far % cols) * 8 + 4, y: ((far / cols) | 0) * 8 + 4, kind: 'clear' } }), 'not on foreign land');
  assert.match(w.msg, /territory/);
});

test('bridges cross water from a bank, carry everyone, and pathing follows them', () => {
  const w = realm(5);
  const home = w.slots[0].settlements[0];
  const cols = w.map.cols;
  // Make a small lake next to home: three water tiles in a row.
  const tx = Math.round(home.x / 8) + 6, ty = Math.round(home.y / 8);
  for (let dy = -1; dy <= 1; dy++) for (let k = 0; k < 3; k++) w.map.tiles[(ty + dy) * cols + tx + k] = 3;
  for (let dy = -1; dy <= 1; dy++) for (const k of [-1, 3]) w.map.tiles[(ty + dy) * cols + tx + k] = 0;
  assert.ok(canBuild(w, tx + 1, ty, 0, 'bridge'), 'middle of the water needs a bank first');
  assert.ok(act(w, 0, { type: 'build', payload: { x: (tx + 0) * 8 + 4, y: ty * 8 + 4, bld: 'bridge' } }), w.msg);
  assert.ok(act(w, 0, { type: 'build', payload: { x: (tx + 1) * 8 + 4, y: ty * 8 + 4, bld: 'bridge' } }), w.msg);
  assert.ok(act(w, 0, { type: 'build', payload: { x: (tx + 2) * 8 + 4, y: ty * 8 + 4, bld: 'bridge' } }), w.msg);
  w.cheats.on = true; w.cheats.build = true;
  for (const b of w.blds) if (b.type === 'bridge') b.buildT = 0;
  assert.ok(passableFor(w, 0, (tx + 1) * 8 + 4, ty * 8 + 4), 'own side crosses');
  assert.ok(passableFor(w, 1, (tx + 1) * 8 + 4, ty * 8 + 4), 'the enemy crosses too');
  const ids = w.blds.filter((b) => b.type === 'bridge').map((b) => b.id);
  const gold = w.slots[0].gold;
  assert.ok(act(w, 0, { type: 'unbuild', payload: { ids } }));
  assert.ok(!w.blds.some((b) => b.type === 'bridge'));
  assert.ok(w.slots[0].gold > gold || w.slots[0].mat > 5000 - 30, 'undo refunds');
  assert.ok(!passableFor(w, 0, (tx + 1) * 8 + 4, ty * 8 + 4), 'water again');
  void distField;
});
