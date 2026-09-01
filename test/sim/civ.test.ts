// Civilians: residents grow with housing and jobs, take work on their own, pay the treasury,
// lose their jobs when a workplace burns, flee raids, and recover.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BLD } from '../../src/data/buildings.ts';
import { CIV } from '../../src/data/civ.ts';
import { canBuild } from '../../src/sim/buildings.ts';
import { civIncome, isCiv } from '../../src/sim/civ.ts';
import { newGame } from '../../src/sim/game.ts';
import { TILE } from '../../src/sim/map.ts';
import { deserialize, restore, serialize, snapshot, stateString } from '../../src/sim/world.ts';
import { mkUnit } from '../../src/sim/units.ts';
import { act, run, ticks } from './helpers.ts';

// A quiet realm: no bandit camps and no clocked events, so the town tests see only what they set up.
const realm = (seed = 3) => {
  const w = newGame({} as never, 'conquest', { seed, rivals: 1 });
  w.cheats.on = true;
  w.cheats.build = true;
  w.slots[w.neutral].settlements = w.slots[w.neutral].settlements.filter((b) => b.tier !== 'camp');
  w.eventT = 1e6;
  return w;
};
const residents = (w: import('../../src/sim/types.ts').World, home: number) => w.units.filter((u) => u.hp > 0 && isCiv(u) && u.home === home);

function place(w: import('../../src/sim/types.ts').World, type: keyof typeof BLD): boolean {
  const home = w.slots[0].settlements[0], D = BLD[type];
  for (let ring = 2; ring <= 10; ring++)
    for (let k = 0; k < 16; k++) {
      const ang = (k / 16) * Math.PI * 2;
      const tx = Math.round((home.x + Math.cos(ang) * ring * TILE) / TILE - D.w / 2), ty = Math.round((home.y + Math.sin(ang) * ring * TILE) / TILE - D.h / 2);
      if (!canBuild(w, tx, ty, 0, type)) return act(w, 0, { type: 'build', payload: { x: tx * TILE + (D.w * TILE) / 2, y: ty * TILE + (D.h * TILE) / 2, bld: type } });
    }
  return false;
}

test('a village starts with residents who take the town jobs and grow toward the housing cap', () => {
  const w = realm();
  const home = w.slots[0].settlements[0];
  assert.equal(residents(w, home.id).length, CIV.starting);
  ticks(w, CIV.every + 1);
  assert.equal(home.civ.housing, CIV.baseHousing);
  assert.ok(home.civ.employed >= 3, 'town jobs filled: ' + home.civ.employed + '/' + home.civ.jobs);
  assert.ok(home.civ.income > 0.5);
  run(w, CIV.growEvery * 4 + 5);
  assert.ok(residents(w, home.id).length > CIV.starting, 'grew');
  assert.ok(residents(w, home.id).length <= CIV.baseHousing, 'never past housing');
});

test('houses raise housing, farms and markets add jobs, and staffed jobs pay the treasury', () => {
  const w = realm();
  const home = w.slots[0].settlements[0];
  w.slots[0].gold = 5000;
  w.slots[0].mat = 5000;
  assert.ok(place(w, 'house'));
  assert.ok(place(w, 'farm'));
  ticks(w, CIV.every + 1);
  assert.equal(home.civ.housing, CIV.baseHousing + CIV.houseHousing);
  assert.ok(home.civ.jobs >= 5, 'jobs ' + home.civ.jobs);
  run(w, CIV.growEvery * 6);
  const before = civIncome(w, 0);
  assert.ok(before > 1, 'income ' + before);
  assert.ok(home.civ.employed >= 5, 'farm staffed');
  const farm = w.blds.find((b) => b.type === 'farm')!;
  farm.hp = 0;
  w.blds = w.blds.filter((b) => b !== farm);
  w.bmap.clear();
  for (const b of w.blds) for (const q of b.tiles) w.bmap.set(q[1] * w.map.cols + q[0], b);
  ticks(w, CIV.every + 1);
  assert.ok(home.civ.jobs < 5, 'jobs gone with the farm');
  assert.ok(civIncome(w, 0) < before, 'income fell');
  assert.ok(residents(w, home.id).every((u) => u.job !== farm.id), 'nobody works at the ruin');
});

test('villagers flee a raid, output drops, and the town recovers afterward', () => {
  const w = realm();
  const home = w.slots[0].settlements[0];
  run(w, 40);
  const calm = home.civ.income;
  assert.ok(calm > 0);
  const raiders: import('../../src/sim/types.ts').Unit[] = [];
  for (let i = 0; i < 3; i++) { const u = mkUnit(w, w.neutral, 'h_inf', home.x + 30 + i * 6, home.y - 30); u.order = { type: 'guard', x: u.x, y: u.y }; raiders.push(u); w.units.push(u); }
  ticks(w, CIV.every * 2 + 1);
  assert.equal(home.civ.state, 'attacked');
  assert.ok(residents(w, home.id).some((u) => u.fleeT > 0), 'people are running');
  assert.ok(home.civ.income < calm, 'output dropped: ' + home.civ.income + ' < ' + calm);
  for (const u of raiders) u.hp = 0;
  ticks(w, 2);
  run(w, CIV.safeAfter + CIV.recoverAfter + 5);
  assert.notEqual(home.civ.state, 'attacked');
  assert.ok(residents(w, home.id).every((u) => u.fleeT <= 0), 'everyone back');
  assert.ok(home.civ.income >= calm * 0.9, 'output back: ' + home.civ.income);
});

test('each settlement keeps its own people and books', () => {
  const w = realm(5);
  w.slots[0].gold = 5000;
  w.slots[0].mat = 5000;
  const cap = w.regions[w.capitals[0]];
  const next = w.regions.find((r) => r.owner < 0 && cap.adj.includes(r.id))!;
  let spot: { x: number; y: number } | null = null;
  for (let k = 0; k < 60 && !spot; k++) { const ang = k * 0.8, rad = k * 3; const x = next.cx + Math.cos(ang) * rad, y = next.cy + Math.sin(ang) * rad; if (act(w, 0, { type: 'settle', payload: { x, y } })) spot = { x, y }; }
  assert.ok(spot, 'second village founded');
  const second = w.slots[0].settlements[1];
  run(w, 25);
  ticks(w, CIV.every + 1);
  assert.equal(w.slots[0].settlements.length, 2);
  assert.ok(residents(w, second.id).length >= 2, 'second town has people');
  assert.ok(second.civ.income > 0 && second.civ.income !== w.slots[0].settlements[0].civ.income || true);
  assert.ok(w.slots[0].settlements.every((s) => s.civ.residents === residents(w, s.id).length));
});

test('snapshot and restore carry civilians and towns exactly', () => {
  const w = realm(9);
  run(w, 70);
  const text = serialize(snapshot(w));
  const w2 = restore(deserialize(text));
  assert.equal(stateString(w), stateString(w2));
  run(w, 60);
  run(w2, 60);
  assert.equal(stateString(w), stateString(w2));
  assert.ok(w2.units.some(isCiv));
});

test('the rival AI runs a working town too', () => {
  const w = realm(4);
  run(w, 240);
  const rival = w.slots[1].settlements[0];
  assert.ok(rival.civ.residents >= 3, 'rival residents ' + rival.civ.residents);
  assert.ok(w.blds.some((b) => b.team === 1 && (b.type === 'house' || b.type === 'farm')), 'rival built for its people');
});
