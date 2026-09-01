// Attack-move goes to the point and fights on the way; guard holds a post and comes back.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TYPES } from '../../src/data/units.ts';
import { mkUnit } from '../../src/sim/units.ts';
import { act, clearBlds, game, run } from './helpers.ts';

function arena() {
  const w = game('sand');
  w.map.tiles.fill(0);
  clearBlds(w);
  for (const s of w.slots) for (const b of s.settlements) b.hp = 0;
  w.phase = 'play';
  return w;
}

test('attack-move walks to the point and engages what it meets', () => {
  const w = arena();
  const k = mkUnit(w, 0, 'kni', 40, 150);
  w.units.push(k);
  const foe = mkUnit(w, 1, 'sct', 40, 100);
  w.units.push(foe);
  assert.ok(act(w, 0, { type: 'attack', payload: { ids: [k.id], target: null, x: 40, y: 40 } }));
  run(w, 6);
  assert.ok(foe.hp <= 0, 'scout on the way is dead');
  run(w, 8);
  assert.ok(Math.hypot(k.x - 40, k.y - 40) < 12, 'then reached the point: ' + k.x + ',' + k.y);
});

test('guard holds the post, fights within reach, and returns', () => {
  const w = arena();
  const g = mkUnit(w, 0, 'shd', 100, 100);
  w.units.push(g);
  assert.ok(act(w, 0, { type: 'guard', payload: { ids: [g.id], x: 100, y: 100 } }));
  const far = mkUnit(w, 1, 'arc', 100, 20);
  far.order = { type: 'move', x: 100, y: 20 };
  w.units.push(far);
  run(w, 5);
  assert.ok(Math.hypot(g.x - 100, g.y - 100) < 6, 'ignores a far enemy: ' + g.x + ',' + g.y);
  const near = mkUnit(w, 1, 'sct', 100, 118);
  near.order = { type: 'move', x: 100, y: 118 };
  w.units.push(near);
  run(w, 6);
  assert.ok(near.hp <= 0, 'kills what comes close');
  run(w, 6);
  assert.ok(Math.hypot(g.x - 100, g.y - 100) < 6, 'back on post: ' + g.x + ',' + g.y);
  assert.equal(g.order?.type, 'guard');
  assert.ok(TYPES.shd);
});
