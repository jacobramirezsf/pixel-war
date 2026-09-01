// Alliances, plain relations, gifts, personalities, and living events.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame } from '../../src/sim/game.ts';
import { allyAccepted, relation, setPact, setTruce } from '../../src/sim/conquest.ts';
import { PERSONAS } from '../../src/data/personas.ts';
import { profileFor } from '../../src/sim/ai/strategy.ts';
import { PROFILES } from '../../src/sim/ai/profiles.ts';
import { computeVision } from '../../src/sim/vision.ts';
import { deserialize, restore, serialize, snapshot, stateString } from '../../src/sim/world.ts';
import { act, run, ticks } from './helpers.ts';

const realm = (seed = 3, rivals = 1) => newGame({} as never, 'conquest', { seed, rivals });

test('relations read as war, peace, or allied, and an alliance needs warmth', () => {
  const w = realm();
  assert.equal(relation(w, 0, 1), 'peace');
  assert.ok(!allyAccepted(w, 0, 1), 'too cool for an alliance at the start');
  assert.ok(!act(w, 0, { type: 'diplomacy', payload: { slot: 1, act: 'ally' } }));
  const before = w.slots[1].attitude[0];
  w.slots[0].gold = 500;
  assert.ok(act(w, 0, { type: 'diplomacy', payload: { slot: 1, act: 'gift', gold: 200 } }));
  assert.ok(w.slots[1].attitude[0] > before, 'a gift warms them');
  w.slots[1].attitude[0] = PERSONAS[w.slots[1].race].allyAt + 5;
  assert.ok(act(w, 0, { type: 'diplomacy', payload: { slot: 1, act: 'ally' } }));
  assert.equal(relation(w, 0, 1), 'allied');
  assert.ok(w.slots[0].pact[1] && w.slots[1].pact[0]);
  // Allies share sight.
  const vis = computeVision(w, 0, new Uint8Array(w.map.cols * w.map.rows));
  const foe = w.slots[1].settlements[0];
  assert.equal(vis[((foe.y / 8) | 0) * w.map.cols + ((foe.x / 8) | 0)], 1, 'the ally home is in sight');
  assert.ok(act(w, 0, { type: 'diplomacy', payload: { slot: 1, act: 'war' } }));
  assert.equal(relation(w, 0, 1), 'war');
  assert.ok(!w.slots[0].pact[1]);
  assert.ok(!act(w, 0, { type: 'diplomacy', payload: { slot: 1, act: 'peace' } }) || relation(w, 0, 1) === 'peace');
});

test('a soured alliance ends on its own, and pacts survive a save', () => {
  const w = realm(4);
  setPact(w, 0, 1, true);
  const w2 = restore(deserialize(serialize(snapshot(w))));
  assert.equal(stateString(w), stateString(w2));
  assert.ok(w2.slots[1].pact[0]);
  w.slots[1].attitude[0] = -40;
  ticks(w, 61);
  assert.ok(!w.slots[1].pact[0], 'the AI walked away');
  assert.equal(relation(w, 0, 1), 'peace', 'peace remains');
  setTruce(w, 0, 1, false);
  assert.equal(relation(w, 0, 1), 'war');
});

test('personalities bend the profile without touching difficulty', () => {
  const w = realm(5, 4);
  const names = new Set(w.slots.filter((s) => !s.neutral).map((s) => PERSONAS[s.race].name));
  assert.ok(names.size >= 1);
  for (let i = 1; i < w.nP; i++) {
    if (w.slots[i].neutral) continue;
    const P = profileFor(w, i), B = PROFILES[w.slots[i].diff], K = PERSONAS[w.slots[i].race];
    assert.equal(P.react, B.react);
    assert.ok(Math.abs(P.expands - B.expands * K.expands) < 1e-9);
  }
});

test("events: a caravan pays on arrival", async () => {
  const w = realm(6);
  w.slots[w.neutral].settlements = w.slots[w.neutral].settlements.filter((b) => b.tier !== 'camp');
  const home = w.slots[0].settlements[0];
  // Force the caravan roll by seeding a caravan the way the event does.
  const { mkUnit } = await import('../../src/sim/units.ts');
  const u = mkUnit(w, 0, 'caravan', home.x + 80, home.y);
  u.home = -2; u.job = home.id; u.order = { type: 'move', x: home.x, y: home.y + 12 };
  w.units.push(u);
  run(w, 20);
  assert.ok(w.events.some((e) => e.text.startsWith('Caravan arrived')), 'paid on arrival');
  assert.ok(!w.units.some((x) => x.type === 'caravan' && x.hp > 0), 'the cart is gone');
});
