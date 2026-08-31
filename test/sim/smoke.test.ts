// Every mode on every built-in map runs 300 ticks without throwing or producing NaN.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUILTIN } from '../../src/data/maps.ts';
import * as C from '../../src/sim/commands.ts';
import type { Mode } from '../../src/sim/types.ts';
import { game, ticks } from './helpers.ts';

const MODES: Mode[] = ['skirmish', 'multi', 'dom', 'rich', 'sand'];

test('all modes on all maps run 300 ticks', () => {
  for (const map of BUILTIN)
    for (const mode of MODES) {
      const w = game(mode, map, mode === 'multi' ? { allies: [0, 1, 2] } : undefined);
      if (mode === 'sand') {
        C.placeUnit(w, 0, 'inf', 60, 150);
        C.placeUnit(w, 1, 'inf', 60, 40);
        assert.ok(C.startBattle(w));
      } else {
        C.buyUnit(w, 0, 'inf');
      }
      ticks(w, 300);
      for (const u of w.units) assert.ok(Number.isFinite(u.x) && Number.isFinite(u.y), mode + ' on ' + map.name + ': unit position is NaN');
      assert.ok(Number.isFinite(w.t));
    }
});

test('five-way multi war runs 300 ticks on every map', () => {
  for (const map of BUILTIN) {
    const w = game('multi', map, { allies: [0, 1, 2, 3, 4] });
    ticks(w, 300);
    assert.equal(w.slots.length, 5);
  }
});
