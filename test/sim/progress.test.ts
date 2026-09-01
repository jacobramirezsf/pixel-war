// Research beyond the smith, building levels, wall sweeps, and villagers who mend and help build.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BLD } from '../../src/data/buildings.ts';
import { addBld } from '../../src/sim/buildings.ts';
import { canResearch, connectedSegments, findSpot, levelSpeed } from '../../src/sim/town.ts';
import { newGame } from '../../src/sim/game.ts';
import { act, run, ticks } from './helpers.ts';

const realm = (seed = 3) => { const w = newGame({} as never, 'conquest', { seed, rivals: 1 }); w.slots[0].gold = 9000; w.slots[0].mat = 9000; w.cheats.on = true; w.cheats.build = true; w.cheats.allAges = true; w.slots[w.neutral].settlements = w.slots[w.neutral].settlements.filter((b) => b.tier !== 'camp'); w.eventT = 1e6; return w; };

test('research lives where it is sold, is gated by age, and farming pays', () => {
  const w = realm();
  const home = w.slots[0].settlements[0];
  assert.match(canResearch(w, 0, 'farming')!, /market/);
  assert.match(canResearch(w, 0, 'melee')!, /blacksmith/);
  const sm = findSpot(w, 0, 'smith', home.x, home.y, 14)!;
  addBld(w, 0, 'smith', sm.tx, sm.ty);
  assert.equal(canResearch(w, 0, 'melee'), null);
  assert.ok(act(w, 0, { type: 'research', payload: { tech: 'melee' } }));
  assert.ok(act(w, 0, { type: 'research', payload: { tech: 'melee' } }));
  w.cheats.allAges = false; ticks(w, 1);
  assert.match(canResearch(w, 0, 'melee')!, /city/, 'level 3 waits for a city');
  w.cheats.allAges = true;
  const mk = findSpot(w, 0, 'market', home.x, home.y, 14)!;
  addBld(w, 0, 'market', mk.tx, mk.ty);
  home.tier = 'city';
  ticks(w, 1);
  assert.equal(canResearch(w, 0, 'farming'), null);
  const fm = findSpot(w, 0, 'farm', home.x, home.y, 14)!;
  addBld(w, 0, 'farm', fm.tx, fm.ty);
  run(w, 40);
  const before = home.civ.income;
  assert.ok(act(w, 0, { type: 'research', payload: { tech: 'farming' } }));
  ticks(w, 31);
  assert.ok(home.civ.income > before, 'farming raised income ' + before + ' -> ' + home.civ.income);
});

test('a barracks levels up and trains faster; a palisade line upgrades to stone in one sweep', () => {
  const w = realm(4);
  const home = w.slots[0].settlements[0];
  const b = w.blds.find((x) => x.type === 'barracks' && x.team === 0)!;
  assert.ok(act(w, 0, { type: 'upgradeBld', payload: { id: b.id } }), w.msg);
  assert.equal(b.level, 2);
  assert.ok(levelSpeed(2) > levelSpeed(1));
  w.cheats.allAges = false; ticks(w, 1);
  assert.ok(!act(w, 0, { type: 'upgradeBld', payload: { id: b.id } }), 'level 3 needs a city');
  w.cheats.allAges = true; ticks(w, 1);
  const tx = Math.round(home.x / 8) + 3, ty = Math.round(home.y / 8) - 5;
  const segs = [0, 1, 2, 3].map((k) => addBld(w, 0, 'stk', tx + k, ty));
  assert.equal(connectedSegments(w, segs[1]).length, 4);
  const mat = w.slots[0].mat;
  assert.ok(act(w, 0, { type: 'upgradeBld', payload: { id: segs[0].id, connected: true } }), w.msg);
  assert.ok(segs.every((s) => s.type === 'wal'), 'all stone');
  assert.ok(segs.every((s) => s.max === BLD.wal.hp));
  assert.ok(w.slots[0].mat < mat, 'paid in materials');
});

test('idle villagers mend damaged buildings and hurry construction', () => {
  const w = realm(5);
  w.cheats.build = false;
  const home = w.slots[0].settlements[0];
  const b = w.blds.find((x) => x.type === 'barracks' && x.team === 0)!;
  b.hp = 100;
  run(w, 25);
  assert.ok(b.hp > 100, 'mended: ' + b.hp);
  const sp = findSpot(w, 0, 'house', home.x, home.y, 14)!;
  assert.ok(act(w, 0, { type: 'build', payload: { x: sp.tx * 8 + 8, y: sp.ty * 8 + 8, bld: 'house' } }));
  const h = w.blds.find((x) => x.type === 'house' && x.buildT > 0)!;
  run(w, 6);
  assert.ok(w.units.some((u) => u.job === -2), 'someone came to help');
  assert.ok(h.buildT < BLD.house.buildT! - 6, 'faster than alone: ' + h.buildT);
});
