// Walls reach the map border, paint drags cannot leave corridors, and repairs make things whole.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BLD } from '../../src/data/buildings.ts';
import { canBuild, passableFor } from '../../src/sim/buildings.ts';
import { newGame } from '../../src/sim/game.ts';
import { TILE } from '../../src/sim/map.ts';
import { act, run } from './helpers.ts';

const realm = (seed = 3) => { const w = newGame({} as never, 'conquest', { seed, rivals: 1 }); w.cheats.on = true; w.cheats.build = true; w.cheats.gold = true; w.cheats.territory = true; w.slots[0].gold = 1e6; w.slots[0].mat = 1e6; return w; };

test('a wall can stand on the outermost tile, sealing the border', () => {
  const w = realm();
  // Find a grass tile on the very west edge.
  let ty = -1;
  for (let y = 1; y < w.map.rows - 1; y++) if (w.map.tiles[y * w.map.cols] === 0 && !w.bmap.has(y * w.map.cols)) { ty = y; break; }
  assert.ok(ty > 0, 'a grass edge tile exists');
  assert.equal(canBuild(w, 0, ty, 0, 'stk'), null, 'edge tile buildable');
  assert.ok(act(w, 0, { type: 'build', payload: { x: 4, y: ty * TILE + 4, bld: 'stk' } }), w.msg);
  run(w, 1);
  assert.equal(passableFor(w, 1, 4, ty * TILE + 4), false, 'the border tile blocks');
});

test('repair makes a damaged building whole for half the missing fraction of its price', () => {
  const w = realm();
  const home = w.slots[0].settlements[0];
  assert.ok(act(w, 0, { type: 'build', payload: { x: home.x + 24, y: home.y + 16, bld: 'house' } }), w.msg);
  run(w, 1);
  const house = w.blds.find((b) => b.team === 0 && b.type === 'house')!;
  house.hp = house.max * 0.25;
  w.cheats.gold = false;
  w.slots[0].gold = 1000;
  const g0 = w.slots[0].gold;
  assert.ok(act(w, 0, { type: 'repairBld', payload: { id: house.id } }), w.msg);
  assert.equal(house.hp, house.max);
  const paid = g0 - w.slots[0].gold;
  assert.equal(paid, Math.ceil(0.75 * BLD.house.cost * 0.5));
  assert.equal(act(w, 0, { type: 'repairBld', payload: { id: house.id } }), false, 'nothing to repair twice');
  // The settlement repairs the same way.
  home.hp = home.max * 0.5;
  assert.ok(act(w, 0, { type: 'repairBld', payload: { id: home.id } }), w.msg);
  assert.equal(home.hp, home.max);
});
