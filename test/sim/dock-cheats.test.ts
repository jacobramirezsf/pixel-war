// Docks are piers, GROW ALL raises every settlement, ALL BUILDINGS unlocks the catalog.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canBuild } from '../../src/sim/buildings.ts';
import { newGame } from '../../src/sim/game.ts';
import { act } from './helpers.ts';

const realm = (seed = 5) => { const w = newGame({} as never, 'conquest', { seed, rivals: 1, size: 'large' }); w.cheats.on = true; w.cheats.territory = true; w.cheats.build = true; w.slots[0].gold = 1e6; w.slots[0].mat = 1e6; return w; };

test('a dock may overhang water: land under one corner, planks over the rest', () => {
  const w = realm();
  w.cheats.allAges = true;
  let overhang = 0, floating = 0, floatingRejected = 0;
  for (let ty = 1; ty < w.map.rows - 2; ty++) for (let tx = 1; tx < w.map.cols - 2; tx++) {
    const cells = [[tx, ty], [tx + 1, ty], [tx, ty + 1], [tx + 1, ty + 1]];
    const water = cells.filter(([x, y]) => w.map.tiles[y * w.map.cols + x] === 3).length;
    if (water > 0 && water < 4 && !canBuild(w, tx, ty, 0, 'dock')) overhang++;
    if (water === 4) { floating++; if (canBuild(w, tx, ty, 0, 'dock')) floatingRejected++; }
  }
  assert.ok(overhang > 30, 'many pier spots: ' + overhang);
  assert.equal(floatingRejected, floating, 'no dock floats in open water');
});

test('GROW ALL steps every settlement up a tier at once', () => {
  const w = realm(7);
  assert.equal(w.slots[0].settlements[0].tier, 'village');
  assert.ok(act(w, 0, { type: 'cheat', payload: { op: 'growAll' } }));
  assert.equal(w.slots[0].settlements[0].tier, 'town');
  assert.ok(act(w, 0, { type: 'cheat', payload: { op: 'growAll' } }));
  assert.equal(w.slots[0].settlements[0].tier, 'city');
  assert.ok(w.slots[0].settlements[0].buildT <= 0 && w.slots[0].settlements[0].hp === w.slots[0].settlements[0].max);
});

test('ALL BUILDINGS skips age, prerequisites, and caps', () => {
  const w = realm(3);
  const home = w.slots[0].settlements[0];
  const spot = (): { tx: number; ty: number } | null => {
    for (let r = 3; r < 16; r++) for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const tx = Math.round(home.x / 8 + Math.cos(a) * r), ty = Math.round(home.y / 8 + Math.sin(a) * r);
      if (!canBuild(w, tx, ty, 0, 'darpa')) return { tx, ty };
    }
    return null;
  };
  assert.equal(spot(), null, 'locked at a village without the cheat');
  w.cheats.allAges = true;
  assert.ok(spot(), 'unlocked everywhere on own land with ALL BUILDINGS');
});
