// M7 slice: take a region from a rival, watch income go negative from upkeep, pull back,
// save, reload, continue.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TYPES } from '../../src/data/units.ts';
import { canSettle, grossIncome, TIERS, upkeepRate } from '../../src/sim/conquest.ts';
import { newGame } from '../../src/sim/game.ts';
import { minesHeld } from '../../src/sim/economy.ts';
import { deserialize, restore, serialize, snapshot, stateString } from '../../src/sim/world.ts';
import { mkUnit } from '../../src/sim/units.ts';
import { act, run, ticks } from './helpers.ts';

const conquest = (seed = 3) => newGame({} as never, 'conquest', { seed });

test('the slice world has nine regions, every tile assigned, capitals in opposite corners', () => {
  const w = conquest();
  assert.equal(w.regions.length, 9);
  assert.equal(w.map.cols, 40);
  const counts = new Array(9).fill(0);
  for (const r of w.regionOf!) counts[r]++;
  assert.ok(counts.every((c) => c > 60), 'every region has tiles ' + counts.join(','));
  assert.notEqual(w.capitals[0], w.capitals[1]);
  assert.equal(w.regions[w.capitals[0]].owner, 0);
  assert.equal(w.regions[w.capitals[1]].owner, 1);
  for (const r of w.regions) assert.ok(r.adj.length >= 2, r.name + ' adjacency');
});

test('settling claims a region after 30 uncontested seconds and connection gates income', () => {
  const w = conquest();
  const cap = w.regions[w.capitals[0]];
  const next = w.regions.find((r) => r.owner < 0 && cap.adj.includes(r.id))!;
  w.slots[0].gold = 500;
  // Find a legal spot near the region center.
  let spot: { x: number; y: number } | null = null;
  for (let k = 0; k < 40 && !spot; k++) { const ang = k * 0.8, rad = k * 3; const x = next.cx + Math.cos(ang) * rad, y = next.cy + Math.sin(ang) * rad; if (!canSettle(w, 0, x, y)) spot = { x, y }; }
  assert.ok(spot, 'a legal settle spot exists');
  assert.ok(act(w, 0, { type: 'settle', payload: spot! }));
  assert.equal(w.slots[0].settlements.length, 2);
  assert.equal(w.slots[0].gold, 350);
  run(w, 10);
  assert.equal(next.owner, -1, 'not claimed yet');
  run(w, 25);
  assert.equal(next.owner, 0, 'claimed');
  assert.ok(next.connected);
  // A region touching none of ours is cut off from the capital.
  const far = w.regions.find((r) => r.owner < 0 && !r.adj.some((a) => w.regions[a].owner === 0))!;
  far.owner = 0;
  ticks(w, 2);
  assert.equal(far.connected, false, 'far region is disconnected');
  const mc = minesHeld(w);
  const withFar = grossIncome(w, 0, mc);
  far.owner = -1;
  ticks(w, 2);
  assert.equal(grossIncome(w, 0, mc), withFar, 'a disconnected settlement-less region adds nothing either way');
});

test('upkeep drives net income negative and units desert when broke', () => {
  const w = conquest();
  const home = w.slots[0].settlements[0];
  for (let i = 0; i < 30; i++) w.units.push(mkUnit(w, 0, 'gnt', home.x + (i % 5) * 14 - 28, home.y - 30 - Math.floor(i / 5) * 14));
  ticks(w, 2);
  assert.ok(upkeepRate(w, 0) > 40, 'upkeep ' + upkeepRate(w, 0));
  assert.ok(w.net[0] < 0, 'net ' + w.net[0]);
  w.slots[0].gold = 5;
  const before = w.units.filter((u) => u.team === 0).length;
  run(w, 20);
  assert.ok(w.units.filter((u) => u.team === 0).length < before, 'deserters');
  assert.match(w.msg, /deserted|yours|Village|Fortress|Settle/);
});

test('garrison shortfall halves a settlement and speeds enemy claims', () => {
  const w = conquest();
  const cap = w.regions[w.capitals[0]];
  // Hostile neighbor pushes the requirement up.
  const nb = w.regions.find((r) => cap.adj.includes(r.id))!;
  nb.owner = 1;
  ticks(w, 2);
  assert.ok(cap.need > 40, 'need ' + cap.need);
  assert.ok(cap.garrison < cap.need);
  const mc = minesHeld(w);
  const short = grossIncome(w, 0, mc);
  for (let i = 0; i < 6; i++) w.units.push(mkUnit(w, 0, 'kni', w.slots[0].settlements[0].x + i * 9 - 27, w.slots[0].settlements[0].y - 24));
  ticks(w, 2);
  assert.ok(cap.garrison >= cap.need, 'garrisoned');
  assert.ok(grossIncome(w, 0, mc) > short, 'income recovers when garrisoned');
});

test('fortress upgrade takes time, then the settlement is stronger', () => {
  const w = conquest();
  const home = w.slots[0].settlements[0];
  w.slots[0].gold = 400;
  assert.ok(act(w, 0, { type: 'upgrade', payload: { id: home.id } }));
  assert.equal(home.tier, 'fortress');
  assert.ok(home.buildT > 0);
  assert.equal(home.max, TIERS.fortress.hp);
  run(w, TIERS.fortress.buildT + 1);
  assert.equal(home.buildT, 0);
});

test('save, reload, and continue identically', () => {
  const w = conquest(9);
  run(w, 90);
  const text = serialize(snapshot(w));
  const w2 = restore(deserialize(text));
  assert.equal(stateString(w), stateString(w2));
  run(w, 60);
  run(w2, 60);
  assert.equal(stateString(w), stateString(w2));
  assert.equal(w2.mode, 'conquest');
  assert.equal(w2.regions.length, 9);
});

test('the rival expands and the game can be won by taking its capital', () => {
  const w = conquest(5);
  run(w, 240);
  assert.ok(w.slots[1].settlements.length >= 2 || w.regions.filter((r) => r.owner === 1).length >= 2, 'rival settled: ' + w.slots[1].settlements.length);
  // Hand the player the rival capital region.
  for (const b of w.slots[1].settlements) b.hp = 0;
  const cap = w.regions[w.capitals[1]];
  cap.owner = 0;
  ticks(w, 2);
  assert.equal(w.over, 'win');
  assert.ok(TYPES.inf);
});
