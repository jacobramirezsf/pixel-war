// The late game: DARPA and the Robotics Lab, their gates, and the two new mechanics.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EXTRA_UNITS, TYPES } from '../../src/data/units.ts';
import { unitVision } from '../../src/data/vision.ts';
import { canBuild } from '../../src/sim/buildings.ts';
import { BLD } from '../../src/data/buildings.ts';
import { setTruce } from '../../src/sim/conquest.ts';
import { newGame } from '../../src/sim/game.ts';
import { findSpot } from '../../src/sim/town.ts';
import { mkUnit } from '../../src/sim/units.ts';
import { act, ticks } from './helpers.ts';

test('the rosters: eighteen DARPA pieces, nine robots, all shared, each with a role', () => {
  const darpa = EXTRA_UNITS.filter((k) => TYPES[k].role === 'darpa'), robots = EXTRA_UNITS.filter((k) => TYPES[k].role === 'robot');
  assert.equal(darpa.length, 18);
  assert.equal(robots.length, 9);
  for (const k of [...darpa, ...robots]) { assert.ok(TYPES[k].extra && TYPES[k].trainer, k); assert.ok(TYPES[k].cost >= 70, k + ' is not cheap'); assert.ok(TYPES[k].sprite.every((r) => r.length === TYPES[k].sprite.length), k + ' sprite square'); }
  assert.ok(darpa.some((k) => TYPES[k].vsAir), 'an anti-air piece');
  assert.ok(darpa.some((k) => TYPES[k].capacity), 'a transport');
  assert.ok(robots.some((k) => TYPES[k].heal) && robots.some((k) => TYPES[k].repair), 'menders');
});

test('DARPA needs a city, a factory, and a castle; the lab needs a factory', () => {
  const w = newGame({} as never, 'conquest', { seed: 8, rivals: 1 });
  w.slots[0].gold = 99999; w.slots[0].mat = 99999; w.cheats.on = true; w.cheats.build = true; w.cheats.allAges = true;
  const home = w.slots[0].settlements[0];
  const tx = Math.round(home.x / 8) + 4, ty = Math.round(home.y / 8) + 4;
  assert.match(canBuild(w, tx, ty, 0, 'darpa') ?? '', /factory|castle|way|edge|territory|ground/);
  const put = (k: 'factory' | 'castle' | 'darpa' | 'robolab'): void => { const sp = findSpot(w, 0, k, home.x, home.y, 24)!; assert.ok(sp, 'room for ' + k); assert.ok(act(w, 0, { type: 'build', payload: { x: sp.tx * 8 + BLD[k].w * 4, y: sp.ty * 8 + BLD[k].h * 4, bld: k } }), k + ': ' + w.msg); };
  put('factory'); put('castle');
  put('darpa');
  assert.ok(act(w, 0, { type: 'buy', payload: { unit: 'a10' } }), w.msg);
  assert.ok(!act(w, 0, { type: 'buy', payload: { unit: 'fixer' } }), 'no lab yet');
  put('robolab');
  assert.ok(act(w, 0, { type: 'buy', payload: { unit: 'fixer' } }), w.msg);
});

test('jammers slow what comes near, drones see far, and the DARPA preset spawns a force', () => {
  const w = newGame({} as never, 'conquest', { seed: 9, rivals: 1 });
  w.cheats.on = true;
  setTruce(w, 0, 1, false);
  const home = w.slots[0].settlements[0];
  const j = mkUnit(w, 0, 'ewv', home.x + 40, home.y); w.units.push(j);
  const foe = mkUnit(w, 1, 'inf', home.x + 52, home.y); foe.order = { type: 'guard', x: foe.x, y: foe.y }; w.units.push(foe);
  ticks(w, 12);
  assert.ok(foe.slowT > 0, 'slowed');
  assert.ok(unitVision(TYPES.predator) > unitVision(TYPES.inf));
  const before = w.units.length;
  assert.ok(act(w, 0, { type: 'cheat', payload: { op: 'army', kind: 'darpa', x: home.x + 60, y: home.y + 60 } }));
  assert.ok(w.units.length >= before + 10, 'a DARPA force: ' + (w.units.length - before));
});
