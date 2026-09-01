// The four command modes and exact targeting.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TYPES } from '../../src/data/units.ts';
import { mkUnit } from '../../src/sim/units.ts';
import { addBld } from '../../src/sim/buildings.ts';
import { act, clearBlds, game, run, ticks } from './helpers.ts';

function arena() {
  const w = game('sand');
  w.map.tiles.fill(0);
  clearBlds(w);
  for (const s of w.slots) for (const b of s.settlements) b.hp = 0;
  w.phase = 'play';
  return w;
}

test('move walks past enemies it is not told to fight', () => {
  const w = arena();
  const k = mkUnit(w, 0, 'kni', 40, 150);
  w.units.push(k);
  const foe = mkUnit(w, 1, 'med', 60, 100);
  w.units.push(foe);
  const hp = foe.hp;
  assert.ok(act(w, 0, { type: 'move', payload: { ids: [k.id], x: 40, y: 40 } }));
  let arrived = false;
  for (let i = 0; i < 60 * 8 && !arrived; i++) { ticks(w, 1); arrived = Math.hypot(k.x - 40, k.y - 40) < 8; }
  assert.ok(arrived, 'arrived ' + k.x + ',' + k.y);
  assert.equal(foe.hp, hp, 'medic untouched on the way');
});

test('an exact target is attacked even when others are closer', () => {
  const w = arena();
  const a = mkUnit(w, 0, 'xbw', 60, 150);
  w.units.push(a);
  const near = mkUnit(w, 1, 'shd', 60, 125), far = mkUnit(w, 1, 'sct', 60, 118);
  w.units.push(near, far);
  assert.ok(act(w, 0, { type: 'attack', payload: { ids: [a.id], target: { kind: 'unit', id: far.id } } }));
  run(w, 3);
  assert.ok(far.hp < TYPES.sct.hp, 'the scout was hit');
  assert.equal(near.hp, TYPES.shd.hp, 'the shield was not');
});

test('an army can focus a building', () => {
  const w = arena();
  const tower = addBld(w, 1, 'twr', 8, 8);
  const ids: number[] = [];
  for (let i = 0; i < 3; i++) { const u = mkUnit(w, 0, 'brk', 80 + i * 8, 120); w.units.push(u); ids.push(u.id); }
  assert.ok(act(w, 0, { type: 'attack', payload: { ids, target: { kind: 'bld', id: tower.id } } }));
  run(w, 15);
  assert.ok(tower.hp < tower.max, 'tower took damage');
});

test('guard follows a friendly unit and defends it', () => {
  const w = arena();
  const mortar = mkUnit(w, 0, 'mor', 60, 150), g = mkUnit(w, 0, 'shd', 80, 160);
  w.units.push(mortar, g);
  assert.ok(act(w, 0, { type: 'guard', payload: { ids: [g.id], x: 0, y: 0, target: { kind: 'unit', id: mortar.id } } }));
  mortar.order = { type: 'move', x: 60, y: 90 };
  run(w, 6);
  assert.ok(Math.hypot(g.x - mortar.x, g.y - mortar.y) < 22, 'guard stays with the mortar: ' + Math.hypot(g.x - mortar.x, g.y - mortar.y).toFixed(0));
  const foe = mkUnit(w, 1, 'sct', mortar.x + 14, mortar.y);
  foe.order = { type: 'move', x: foe.x, y: foe.y };
  w.units.push(foe);
  run(w, 5);
  assert.ok(foe.hp <= 0, 'guard killed the raider');
});

test('hold stays put and does not chase far', () => {
  const w = arena();
  const h = mkUnit(w, 0, 'kni', 100, 100);
  w.units.push(h);
  assert.ok(act(w, 0, { type: 'hold', payload: { ids: [h.id] } }));
  const tease = mkUnit(w, 1, 'sct', 100, 60);
  tease.order = { type: 'move', x: 100, y: 60 };
  w.units.push(tease);
  run(w, 5);
  assert.ok(Math.hypot(h.x - 100, h.y - 100) < 8, 'held: ' + h.x + ',' + h.y);
  assert.equal(h.order?.type, 'guard');
});
