// Realm worlds: sized by grid, every region reachable, a mine per region, capitals apart, fog of war.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame } from '../../src/sim/game.ts';
import { offshore } from '../../src/sim/realmgen.ts';
import { distField } from '../../src/sim/pathing.ts';
import { deserialize, restore, serialize, snapshot, stateString } from '../../src/sim/world.ts';
import { seenAt } from '../../src/sim/vision.ts';
import { mkUnit } from '../../src/sim/units.ts';
import { run, ticks } from './helpers.ts';

const realm = (seed: number, size: 'small' | 'standard' | 'large', rivals = 1) => newGame({} as never, 'conquest', { seed, rivals, size });

test('every region center is reachable from the capital on many seeds and sizes', () => {
  for (const size of ['small', 'standard', 'large'] as const)
    for (let seed = 1; seed <= 6; seed++) {
      const w = realm(seed, size, size === 'large' ? 4 : 2);
      const cap = w.map.bases[0];
      const d = distField(w.map, cap.tx, cap.ty);
      let sea = 0;
      for (const r of w.regions) {
        const tx = Math.round(r.cx / 8), ty = Math.round(r.cy / 8);
        // A region whose center is open water is sea: reached by boat, not by road.
        if (offshore(w.map, tx, ty)) { sea++; continue; }
        assert.ok(d[ty * w.map.cols + tx] < Infinity, size + ' seed ' + seed + ' region ' + r.name + ' cut off');
      }
      assert.ok(sea <= w.regions.length / 4, 'mostly land: ' + sea + ' sea regions');
      for (const b of w.map.bases) assert.ok(d[b.ty * w.map.cols + b.tx] < Infinity, 'capital reachable');
      assert.ok(w.mines.length >= w.regions.length * 0.6, size + ' mines ' + w.mines.length);
      const water = Array.from(w.map.tiles).filter((t) => t === 3).length / w.map.tiles.length;
      assert.ok(water > 0.02 && water < 0.25, 'water share ' + water.toFixed(2));
    }
});

test('worlds differ by seed and repeat by seed', () => {
  const a = realm(11, 'standard'), b = realm(12, 'standard'), c = realm(11, 'standard');
  assert.notEqual(Array.from(a.map.tiles).join(''), Array.from(b.map.tiles).join(''));
  assert.equal(Array.from(a.map.tiles).join(''), Array.from(c.map.tiles).join(''));
  assert.ok(Math.hypot(a.map.bases[0].tx - a.map.bases[1].tx, a.map.bases[0].ty - a.map.bases[1].ty) > 40, 'capitals far apart');
});

test('fog: the player explores by moving, the rival capital starts unknown, and saves keep the explored map', () => {
  const w = realm(3, 'standard');
  ticks(w, 12);
  const home = w.slots[0].settlements[0], foe = w.slots[1].settlements[0];
  assert.ok(seenAt(w, home.x, home.y), 'home known');
  assert.ok(!seenAt(w, foe.x, foe.y), 'rival capital unknown');
  const before = w.seen!.reduce((a, b) => a + b, 0);
  const sc = mkUnit(w, 0, 'sct', home.x, home.y);
  sc.order = { type: 'move', x: foe.x, y: foe.y };
  w.units.push(sc);
  run(w, 40);
  assert.ok(w.seen!.reduce((a, b) => a + b, 0) > before + 200, 'scout revealed land');
  const w2 = restore(deserialize(serialize(snapshot(w))));
  assert.equal(stateString(w), stateString(w2));
  assert.equal(w2.seen!.reduce((a, b) => a + b, 0), w.seen!.reduce((a, b) => a + b, 0));
});
