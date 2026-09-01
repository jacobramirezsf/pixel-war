// M8: unrest and revolt, neutrals, materials and population, the full tiers, veterancy,
// diplomacy, and worlds with several rivals.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TYPES } from '../../src/data/units.ts';
import { canAbsorb, hasCity, popCap, popUsed, setTruce, TIERS } from '../../src/sim/conquest.ts';
import { canBuild } from '../../src/sim/buildings.ts';
import { newGame } from '../../src/sim/game.ts';
import { mkUnit, rank } from '../../src/sim/units.ts';
import { act, run, ticks } from './helpers.ts';

// Rivals start at peace in a Realm. These tests want a war.
const conquest = (seed = 3, rivals = 1) => { const w = newGame({} as never, 'conquest', { seed, rivals }); for (let i = 1; i <= rivals; i++) setTruce(w, 0, i, false); return w; };

test('a neutral faction exists with camps, independents, and ruins', () => {
  const w = conquest();
  assert.ok(w.neutral >= 0);
  const ns = w.slots[w.neutral];
  assert.ok(ns.neutral);
  const tiers = ns.settlements.map((b) => b.tier);
  assert.ok(tiers.includes('camp') && tiers.includes('village') && tiers.includes('ruin'), tiers.join(','));
  assert.ok(w.rules.unrest && w.rules.materials && w.rules.population && w.rules.diplomacy && w.rules.veterancy);
});

test('unrest climbs in an undermanned border region and the region revolts', () => {
  const w = conquest();
  const cap = w.regions[w.capitals[0]];
  const nb = w.regions.find((r) => cap.adj.includes(r.id))!;
  nb.owner = 0;
  // A hostile neighbor is what asks for a garrison.
  const foe = w.regions.find((r) => nb.adj.includes(r.id) && r.id !== cap.id && r.owner < 0)!;
  foe.owner = 1;
  for (const u of w.units) if (u.team === 0) u.hp = 0;
  nb.unrest = 90;
  let revolted = false;
  for (let i = 0; i < 60 * 40 && !revolted; i++) { ticks(w, 1); revolted = w.events.some((e) => e.kind === 'revolt'); }
  assert.ok(revolted, 'unrest ' + nb.unrest + ' owner ' + nb.owner);
  assert.equal(nb.owner, -1);
  assert.ok(w.units.some((u) => u.team === w.neutral && Math.hypot(u.x - nb.cx, u.y - nb.cy) < 40), 'rebels spawned');
  // The capital itself does not revolt over a thin garrison.
  cap.unrest = 90;
  run(w, 20);
  assert.ok(cap.unrest < 90 && cap.owner === 0, 'capital calm ' + cap.unrest);
});

test('bandit camps raid and drop loot when cleared', () => {
  const w = conquest();
  const camp = w.slots[w.neutral].settlements.find((b) => b.tier === 'camp')!;
  camp.nT = 5;
  run(w, 10);
  assert.ok(w.units.some((u) => u.team === w.neutral), 'raiders exist');
  const gold = w.slots[0].gold, mat = w.slots[0].mat;
  w.units = w.units.filter((u) => u.team !== w.neutral);
  camp.hitBy = 0;
  camp.hp = 1;
  const kn = mkUnit(w, 0, 'kni', camp.x, camp.y + 14);
  kn.order = { type: 'attack', tgt: camp };
  w.units.push(kn);
  run(w, 5);
  assert.ok(camp.hp <= 0, 'camp cleared');
  assert.ok(w.slots[0].gold > gold + 50 && w.slots[0].mat > mat + 30, 'loot');
});

test('independent villages can be absorbed for gold', () => {
  const w = conquest();
  const v = w.slots[w.neutral].settlements.find((b) => b.tier === 'village')!;
  w.regions[v.region].owner = 0;
  w.slots[0].gold = 500;
  assert.ok(canAbsorb(w, 0, v), 'needs units nearby first');
  w.units.push(mkUnit(w, 0, 'inf', v.x, v.y + 12));
  ticks(w, 1);
  assert.equal(canAbsorb(w, 0, v), null);
  assert.ok(act(w, 0, { type: 'absorb', payload: { id: v.id } }));
  assert.ok(w.slots[0].settlements.includes(v));
  assert.equal(Math.round(w.slots[0].gold), 300);
});

test('population caps the army and a city unlocks advanced units', () => {
  const w = conquest();
  w.slots[0].gold = 5000;
  w.slots[0].mat = 5000;
  assert.equal(popCap(w, 0), 10 + TIERS.village.pop);
  assert.ok(!act(w, 0, { type: 'buy', payload: { unit: 'gnt' } }), 'giant needs a castle');
  let bought = 0;
  while (act(w, 0, { type: 'buy', payload: { unit: 'wrk' } })) bought++;
  assert.ok(bought >= 10 && bought <= 20, 'bought ' + bought);
  assert.ok(popUsed(w, 0) <= popCap(w, 0));
  const cap = w.slots[0].settlements[0];
  assert.ok(act(w, 0, { type: 'upgrade', payload: { id: cap.id } }));
  assert.equal(cap.tier, 'town');
  run(w, TIERS.town.buildT + 1);
  assert.ok(act(w, 0, { type: 'upgrade', payload: { id: cap.id } }));
  assert.equal(cap.tier, 'city');
  run(w, TIERS.city.buildT + 1);
  assert.ok(hasCity(w, 0));
  assert.equal(w.slots[0].age, 2);
});

test('walls cost materials, and materials come from the land', () => {
  const w = conquest();
  const home = w.slots[0].settlements[0];
  w.slots[0].age = 1;
  let spot = { x: home.x, y: home.y - 40 };
  for (let dx = -6; dx <= 6 && canBuild(w, ((spot.x / 8) | 0), ((spot.y / 8) | 0), 0, 'wal'); dx++) spot = { x: home.x + dx * 8, y: home.y - 40 };
  w.slots[0].mat = 0;
  assert.ok(!act(w, 0, { type: 'build', payload: { x: spot.x, y: spot.y, bld: 'wal' } }), 'no materials');
  w.slots[0].mat = 100;
  assert.ok(act(w, 0, { type: 'build', payload: { x: spot.x, y: spot.y, bld: 'wal' } }), w.msg);
  assert.equal(w.slots[0].mat, 85);
  run(w, 10);
  assert.ok(w.slots[0].mat > 85, 'materials accrue');
});

test('kills earn rank, rank adds damage and health', () => {
  const w = conquest();
  const kn = mkUnit(w, 0, 'kni', 100, 100);
  kn.kills = 9;
  assert.equal(rank(kn), 3);
  w.units.push(kn);
  const sct = mkUnit(w, 1, 'sct', 100, 106);
  w.units.push(sct);
  run(w, 2);
  assert.ok(sct.hp <= 0, 'veteran kills scout');
  assert.ok(kn.kills >= 10);
});

test('truces stop the fighting and rivals accept them when weaker', () => {
  const w = conquest(7);
  w.slots[w.neutral].settlements = [];
  w.units = [];
  w.slots[1].attitude[0] = 10;
  assert.ok(act(w, 0, { type: 'truce', payload: { slot: 1, offer: true } }));
  assert.ok(w.slots[0].truce[1] && w.slots[1].truce[0]);
  const home = w.slots[0].settlements[0];
  const a = mkUnit(w, 0, 'inf', home.x, home.y - 60), b = mkUnit(w, 1, 'inf', home.x, home.y - 66);
  w.units.push(a, b);
  run(w, 3);
  assert.equal(a.hp, TYPES.inf.hp);
  assert.equal(b.hp, TYPES.inf.hp);
  assert.ok(act(w, 0, { type: 'truce', payload: { slot: 1, offer: false } }));
  assert.ok(!w.slots[0].truce[1]);
  run(w, 3);
  assert.ok(a.hp < TYPES.inf.hp || b.hp < TYPES.inf.hp, 'fighting resumed');
});

test('three rivals get a bigger world with sixteen or more regions', () => {
  const w = conquest(4, 3);
  assert.equal(w.slots.filter((s) => !s.neutral).length, 4);
  assert.ok(w.regions.length >= 16, 'regions ' + w.regions.length);
  assert.ok(w.map.cols >= 60);
  const caps = new Set(w.capitals.filter((c) => c >= 0));
  assert.equal(caps.size, 4);
  run(w, 30);
  assert.ok(w.units.length > 0);
});
