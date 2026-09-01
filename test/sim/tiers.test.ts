// Power grows faster than price: an expensive unit beats the soldiers its gold would buy.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUILTIN } from '../../src/data/maps.ts';
import { TYPES } from '../../src/data/units.ts';
import { newGame } from '../../src/sim/game.ts';
import { mkUnit } from '../../src/sim/units.ts';
import { run } from './helpers.ts';

/** One unit of `type` against as many soldiers as it costs. Returns true when it wins. */
function duel(type: string, seed: number): boolean {
  const w = newGame(BUILTIN[4], 'sand', { seed });
  w.map.tiles.fill(0);
  w.blds = []; w.bmap.clear(); w.flowDirty = true;
  // No bases: the base gun would decide the fight and the flow field would pull units away.
  for (const s of w.slots) for (const b of s.settlements) b.hp = 0;
  const n = Math.max(1, Math.round(TYPES[type].cost / TYPES.inf.cost));
  const big = mkUnit(w, 0, type, 96, 120);
  big.order = { type: 'attack', tgt: null };
  w.units.push(big);
  for (let i = 0; i < n; i++) { const u = mkUnit(w, 1, 'inf', 70 + (i % 4) * 12, 60 + Math.floor(i / 4) * 10); u.order = { type: 'attack', tgt: null }; w.units.push(u); }
  w.phase = 'play';
  run(w, 90);
  return big.hp > 0 && !w.units.some((u) => u.team === 1);
}

test('a line or heavy unit beats the soldiers its gold buys, at every tier', () => {
  // Fast units are meant to lose a stand-up fight against line infantry, so they are not here.
  const picks = ['spr', 'shd', 'brk', 'tnk', 'mch', 'gnt', 'h_troll', 'u_coloss', 'f_bulw', 'w_treant'];
  const fails: string[] = [];
  for (const k of picks) {
    let wins = 0;
    for (let seed = 1; seed <= 3; seed++) if (duel(k, seed)) wins++;
    if (wins < 2) fails.push(k + ' ' + wins + '/3');
  }
  assert.equal(fails.length, 0, 'lost their duels: ' + fails.join(', '));
});

test('scaling leaves the cheapest units alone', () => {
  assert.equal(TYPES.inf.hp, 40);
  assert.equal(TYPES.inf.dmg, 8);
  assert.ok(TYPES.gnt.hp > 400 && TYPES.gnt.dmg > 45, 'giant ' + TYPES.gnt.hp + '/' + TYPES.gnt.dmg);
});
