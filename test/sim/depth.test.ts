// M6: production queue with refunds, rally points, retreat that disengages, healing at home.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TYPES } from '../../src/data/units.ts';
import { mkUnit, buildTime } from '../../src/sim/units.ts';
import { act, buy, game, run, ticks } from './helpers.ts';

test('units take time to build, queue at their building, and refund on cancel', () => {
  const w = game('skirmish');
  w.slots[0].gold = 200;
  assert.ok(buy(w, 0, 'sct'));
  assert.ok(buy(w, 0, 'arc'));
  const range = w.blds.find((b) => b.team === 0 && b.type === 'range')!;
  assert.equal(w.slots[0].queue.length, 1, 'scout at the settlement');
  assert.equal(range.queue.length, 1, 'archer at the range');
  assert.equal(w.slots[0].gold, 160);
  assert.equal(w.units.filter((u) => u.team === 0).length, 0, 'nothing spawns instantly');
  run(w, buildTime('sct') + 0.1);
  assert.equal(w.units.filter((u) => u.team === 0 && u.type === 'sct').length, 1);
  const before = w.slots[0].gold;
  assert.ok(act(w, 0, { type: 'cancel', payload: { index: 0, building: range.id } }));
  assert.equal(Math.round(w.slots[0].gold - before), 30, 'archer refunded');
  assert.equal(range.queue.length, 0);
});

test('new units walk to the rally point', () => {
  const w = game('skirmish');
  const b = w.slots[0].settlements[0];
  assert.ok(act(w, 0, { type: 'rally', payload: { x: b.x + 30, y: b.y - 40 } }));
  buy(w, 0, 'sct');
  run(w, 6);
  const u = w.units.find((x) => x.team === 0)!;
  assert.ok(Math.hypot(u.x - (b.x + 30), u.y - (b.y - 40)) < 12, 'scout at rally ' + u.x + ',' + u.y);
});

test('retreating units stop fighting and reach home, then heal there', () => {
  const w = game('sand');
  w.map.tiles.fill(0);
  const home = w.slots[0].settlements[0];
  const kn = mkUnit(w, 0, 'kni', home.x, home.y - 70);
  kn.hp = 20;
  w.units.push(kn);
  const foe = mkUnit(w, 1, 'shd', home.x, home.y - 80);
  w.units.push(foe);
  w.phase = 'play';
  kn.order = { type: 'retreat' };
  run(w, 6);
  assert.equal(foe.hp, TYPES.shd.hp, 'retreating knight never swung');
  assert.ok(Math.hypot(kn.x - home.x, kn.y - home.y) < 30, 'knight came home');
  const before = kn.hp;
  ticks(w, 120);
  assert.ok(kn.hp > before, 'healed at home ' + before + ' -> ' + kn.hp);
  const w2 = game('sand');
  w2.map.tiles.fill(0);
  const h2 = w2.slots[0].settlements[0];
  const a = mkUnit(w2, 0, 'kni', h2.x - 10, h2.y - 20); a.hp = 20; w2.units.push(a);
  const med = mkUnit(w2, 0, 'med', h2.x + 10, h2.y - 20); w2.units.push(med);
  w2.phase = 'play';
  ticks(w2, 120);
  assert.ok(a.hp > kn.hp, 'medic at home heals faster ' + a.hp + ' vs ' + kn.hp);
});

test('the AI still fields an army through the queue', () => {
  const w = game('skirmish');
  run(w, 60);
  assert.ok(w.units.filter((u) => u.team === 1).length >= 3, 'AI units: ' + w.units.filter((u) => u.team === 1).length);
});
