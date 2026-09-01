// A destructive power must not leave the game unusable: the sim survives a nuke over a full
// city, effects never draw with a negative radius, and a damaged save falls back to the last good one.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame } from '../../src/sim/game.ts';
import { deserialize, restore, serialize, snapshot, stateString } from '../../src/sim/world.ts';
import { act, run, ticks } from './helpers.ts';

test('nuke over a maxed city: the sim keeps running, effects stay sane, the save round-trips', () => {
  const w = newGame({} as never, 'conquest', { seed: 5, rivals: 2 });
  w.cheats.on = true; w.cheats.gold = true; w.cheats.powers = true;
  const home = w.slots[0].settlements[0];
  act(w, 0, { type: 'cheat', payload: { op: 'maxCity', id: home.id } });
  act(w, 0, { type: 'cheat', payload: { op: 'army', kind: 'large', x: home.x + 40, y: home.y + 40 } });
  run(w, 3);
  for (let i = 0; i < 4; i++) assert.ok(act(w, 0, { type: 'power', payload: { power: 'nuke', x: home.x + i * 20, y: home.y } }), w.msg);
  // Save while the strikes are still in the air, as an autosave might.
  const mid = serialize(snapshot(w));
  run(w, 4);
  for (const f of w.fx) if (f.k === 'boom') assert.ok(f.t <= (f.d ?? 0.25) && f.r >= 0, 'boom within its own life');
  assert.ok(w.slots[0].settlements.some((b) => b.hp > 0), 'the people regrouped');
  const w2 = restore(deserialize(mid));
  run(w2, 4);
  assert.ok(w2.units.length > 0);
  const w3 = restore(deserialize(serialize(snapshot(w))));
  assert.equal(stateString(w), stateString(w3));
  ticks(w, 60); ticks(w3, 60);
  assert.equal(stateString(w), stateString(w3));
});
