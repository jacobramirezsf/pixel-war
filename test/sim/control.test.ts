// Capture, attacks that declare war, training at a chosen building, defaults, and removal refunds.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BLD } from '../../src/data/buildings.ts';
import { addBld } from '../../src/sim/buildings.ts';
import { canCapture, relation, setTruce } from '../../src/sim/conquest.ts';
import { newGame } from '../../src/sim/game.ts';
import { findSpot } from '../../src/sim/town.ts';
import { mkUnit } from '../../src/sim/units.ts';
import { act, ticks } from './helpers.ts';

const realm = (seed = 3) => newGame({} as never, 'conquest', { seed, rivals: 1 });

test('a razed enemy settlement can be captured once soldiers hold it and no defenders remain', () => {
  const w = realm();
  setTruce(w, 0, 1, false);
  const foe = w.slots[1].settlements[0], r = w.regions[foe.region];
  assert.equal(canCapture(w, 0, foe), 'still standing: bring it down first');
  foe.hp = 0;
  assert.equal(canCapture(w, 0, foe), 'bring soldiers to it');
  const k = mkUnit(w, 0, 'kni', foe.x + 10, foe.y);
  w.units.push(k);
  const d = mkUnit(w, 1, 'inf', foe.x - 20, foe.y);
  w.units.push(d);
  assert.equal(canCapture(w, 0, foe), 'enemy units still defending');
  d.hp = 0;
  ticks(w, 1);
  // Not next to our land yet on this seed? Make it so.
  r.adj.forEach((a) => { if (w.regions[a].owner < 0) w.regions[a].owner = 0; });
  assert.equal(canCapture(w, 0, foe), null);
  w.slots[0].gold = 500;
  assert.ok(act(w, 0, { type: 'capture', payload: { id: foe.id } }), w.msg);
  assert.equal(foe.team, 0);
  assert.ok(foe.hp > 0);
  assert.equal(r.owner, 0);
  assert.ok(w.slots[0].settlements.includes(foe) && !w.slots[1].settlements.includes(foe));
  assert.ok(w.history.some((h) => h.text.startsWith('Captured')));
});

test('attacking someone at peace needs the declaration flag and then starts a war', () => {
  const w = realm(4);
  const foe = w.slots[1].settlements[0];
  const k = mkUnit(w, 0, 'kni', foe.x + 30, foe.y);
  w.units.push(k);
  assert.equal(relation(w, 0, 1), 'peace');
  assert.ok(!act(w, 0, { type: 'attack', payload: { ids: [k.id], target: { kind: 'base', id: foe.id } } }), 'refused without declaring');
  assert.ok(act(w, 0, { type: 'attack', payload: { ids: [k.id], target: { kind: 'base', id: foe.id }, declare: true } }));
  assert.equal(relation(w, 0, 1), 'war');
  assert.equal(k.order?.type, 'attack');
  assert.ok(w.history.some((h) => h.text.includes('without warning')));
});

test('units train at the named building, defaults hold, and removal refunds half', () => {
  const w = realm(5);
  w.slots[0].gold = 5000; w.slots[0].mat = 5000; w.cheats.on = true; w.cheats.build = true;
  const home = w.slots[0].settlements[0];
  const spot = findSpot(w, 0, 'barracks', home.x + 60, home.y, 14)!;
  const b2 = addBld(w, 0, 'barracks', spot.tx, spot.ty);
  const b1 = w.blds.find((b) => b.type === 'barracks' && b !== b2)!;
  assert.ok(act(w, 0, { type: 'buy', payload: { unit: 'inf', building: b2.id } }));
  assert.equal(b2.queue.length, 1);
  assert.equal(b1.queue.length, 0);
  assert.ok(act(w, 0, { type: 'setDefault', payload: { role: 'line', building: b2.id } }));
  assert.ok(act(w, 0, { type: 'buy', payload: { unit: 'inf' } }));
  assert.equal(b2.queue.length, 2, 'the default took it even though the other queue is shorter');
  assert.ok(act(w, 0, { type: 'buy', payload: { unit: 'inf', near: home.id } }));
  assert.equal(b2.queue.length, 3, 'a default beats nearness');
  const gold = w.slots[0].gold;
  assert.ok(act(w, 0, { type: 'sell', payload: { x: b2.x, y: b2.y, id: b2.id } }));
  assert.ok(!w.blds.includes(b2));
  assert.equal(w.slots[0].gold - gold, Math.floor(BLD.barracks.cost / 2));
  const mat = w.slots[0].mat;
  const wall = addBld(w, 0, 'stk', Math.round(home.x / 8) + 3, Math.round(home.y / 8) - 4);
  assert.ok(act(w, 0, { type: 'sell', payload: { x: wall.x, y: wall.y } }));
  assert.equal(w.slots[0].mat - mat, 3, 'walls refund materials');
});
