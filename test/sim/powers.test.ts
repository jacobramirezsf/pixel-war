// Player powers and instant production.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { POWERS } from '../../src/data/powers.ts';
import { TYPES } from '../../src/data/units.ts';
import { mkUnit } from '../../src/sim/units.ts';
import { newGame } from '../../src/sim/game.ts';
import { BUILTIN } from '../../src/data/maps.ts';
import { act, buy, game, run, ticks } from './helpers.ts';

test('barrage lands after a delay and hits what is there', () => {
  const w = game('skirmish');
  w.slots[0].gold = 500;
  const foe = mkUnit(w, 1, 'shd', 80, 80);
  w.units.push(foe);
  assert.ok(act(w, 0, { type: 'power', payload: { power: 'barrage', x: 80, y: 80 } }));
  assert.equal(w.slots[0].gold, 440);
  assert.ok(w.strikes.length === 1);
  ticks(w, 30);
  assert.equal(foe.hp, TYPES.shd.hp, 'not yet');
  run(w, 1.2);
  assert.ok(foe.hp < TYPES.shd.hp, 'hit ' + foe.hp);
  assert.ok(!act(w, 0, { type: 'power', payload: { power: 'barrage', x: 80, y: 80 } }), 'recharging');
  assert.match(w.msg, /recharging/);
});

test('smite, heal, haste, freeze, reinforce', () => {
  const w = game('rich');
  const foe = mkUnit(w, 1, 'shd', 80, 80);
  w.units.push(foe);
  assert.ok(act(w, 0, { type: 'power', payload: { power: 'smite', x: 82, y: 80 } }));
  assert.ok(foe.hp < TYPES.shd.hp - 50, 'smite ' + foe.hp);
  const own = mkUnit(w, 0, 'kni', 120, 120);
  own.hp = 10;
  w.units.push(own);
  assert.ok(act(w, 0, { type: 'power', payload: { power: 'heal', x: 120, y: 120 } }));
  assert.equal(own.hp, 50);
  assert.ok(act(w, 0, { type: 'power', payload: { power: 'haste', x: 120, y: 120 } }));
  assert.ok(own.hasteT > 0);
  assert.ok(act(w, 0, { type: 'power', payload: { power: 'freeze', x: 80, y: 80 } }));
  assert.ok(foe.rootT >= 3);
  const n = w.units.filter((u) => u.team === 0).length;
  assert.ok(act(w, 0, { type: 'power', payload: { power: 'reinforce', x: 120, y: 126 } }));
  assert.equal(w.units.filter((u) => u.team === 0).length, n + 3);
  assert.ok(!act(w, 0, { type: 'power', payload: { power: 'reinforce', x: 20, y: 20 } }), 'cooldown');
  for (const k of Object.keys(POWERS)) if (k !== 'barrage') assert.ok((w.slots[0].powerCd as Record<string, number>)[k] > 0, k + ' on cooldown');
});

test('instant production skips the queue time', () => {
  const w = newGame(BUILTIN[0], 'skirmish', { seed: 1, instant: true });
  w.slots[0].gold = 200;
  buy(w, 0, 'shd');
  ticks(w, 1);
  assert.equal(w.units.filter((u) => u.team === 0).length, 1);
  assert.equal(w.slots[0].queue.length, 0);
});
