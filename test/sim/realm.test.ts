// Realm: no end unless a goal is set, events on a clock with answers, regroup after a loss, the Wonder.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame } from '../../src/sim/game.ts';
import { act, run, ticks } from './helpers.ts';

const realm = (seed = 3, goal: 'none' | 'capitals' | 'land' = 'none') => newGame({} as never, 'conquest', { seed, rivals: 1, goal });

test('rivals start at peace, days tick, and nothing ends without a goal', () => {
  const w = realm();
  assert.ok(w.slots[0].truce[1] && w.slots[1].truce[0]);
  for (const b of w.slots[1].settlements) b.hp = 0;
  w.regions[w.capitals[1]].owner = 0;
  run(w, 130);
  assert.equal(w.over, null, 'no goal, no end');
  assert.equal(w.day, 1);
  const g = realm(3, 'capitals');
  for (const b of g.slots[1].settlements) b.hp = 0;
  g.regions[g.capitals[1]].owner = 0;
  ticks(g, 2);
  assert.equal(g.over, 'win');
});

test('events fire on a clock and choices resolve', () => {
  const w = realm(5);
  w.eventT = 1;
  let sawEvent = false, sawPending = false;
  for (let i = 0; i < 60 * 400 && !sawPending; i++) {
    if (w.pending) { sawPending = true; break; }
    if (w.events.some((e) => e.kind === 'raid' || e.kind === 'unrest' || e.kind === 'claim' || e.kind === 'loot' || e.kind === 'war')) sawEvent = true;
    if (w.eventT > 5) w.eventT = 1;
    ticks(w, 1);
  }
  assert.ok(sawEvent || sawPending, 'something happened');
  if (w.pending) {
    const kind = w.pending.kind, gold = w.slots[0].gold;
    assert.ok(act(w, 0, { type: 'choose', payload: { yes: true } }));
    assert.equal(w.pending, null);
    if (kind === 'caravan') assert.equal(Math.round(w.slots[0].gold - gold), 80);
  }
});

test('losing the last settlement regroups the people instead of ending the realm', () => {
  const w = realm(7);
  const old = w.capitals[0];
  for (const b of w.slots[0].settlements) b.hp = 0;
  ticks(w, 2);
  assert.equal(w.over, null);
  assert.ok(w.slots[0].settlements.some((b) => b.hp > 0), 'a new village');
  assert.notEqual(w.capitals[0], old);
  assert.ok(w.slots[0].gold >= 300);
  assert.match(w.msg, /regroup/);
});
