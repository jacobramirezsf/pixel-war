// The town layer: footprints, construction, per-building training, ages, research, cheats.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BLD } from '../../src/data/buildings.ts';
import { BUILTIN } from '../../src/data/maps.ts';
import { canBuild } from '../../src/sim/buildings.ts';
import { popCap, TIERS } from '../../src/sim/conquest.ts';
import { newGame } from '../../src/sim/game.ts';
import { ageOf, canTrain, ownBlds } from '../../src/sim/town.ts';
import { TILE } from '../../src/sim/map.ts';
import { act, run, ticks } from './helpers.ts';

const conquest = (seed = 3) => newGame({} as never, 'conquest', { seed, rivals: 1 });

function spot(w: import('../../src/sim/types.ts').World, type: keyof typeof BLD): { x: number; y: number } {
  const home = w.slots[0].settlements[0], D = BLD[type];
  for (let ring = 2; ring <= 10; ring++)
    for (let k = 0; k < 16; k++) {
      const ang = (k / 16) * Math.PI * 2;
      const px = home.x + Math.cos(ang) * ring * TILE, py = home.y + Math.sin(ang) * ring * TILE;
      const tx = Math.round(px / TILE - D.w / 2), ty = Math.round(py / TILE - D.h / 2);
      if (!canBuild(w, tx, ty, 0, type)) return { x: tx * TILE + (D.w * TILE) / 2, y: ty * TILE + (D.h * TILE) / 2 };
    }
  throw new Error('no spot for ' + type);
}

test('houses have a footprint, take time to build, and raise the population cap', () => {
  const w = conquest();
  w.slots[0].gold = 1000;
  const cap0 = popCap(w, 0);
  const p = spot(w, 'house');
  assert.ok(act(w, 0, { type: 'build', payload: { x: p.x, y: p.y, bld: 'house' } }), w.msg);
  assert.equal(w.slots[0].gold, 1000 - BLD.house.cost);
  const h = w.blds.find((b) => b.type === 'house')!;
  assert.equal(h.tiles.length, 4);
  assert.ok(h.buildT > 0);
  assert.equal(popCap(w, 0), cap0, 'not until finished');
  run(w, BLD.house.buildT! + 1);
  assert.equal(h.buildT, 0);
  assert.equal(popCap(w, 0), cap0 + 5);
});

test('line units need a barracks and then train there', () => {
  const w = conquest();
  w.slots[0].gold = 2000;
  assert.match(canTrain(w, 0, 'arc') ?? '', /range/);
  assert.ok(!act(w, 0, { type: 'buy', payload: { unit: 'arc' } }));
  assert.equal(canTrain(w, 0, 'wrk'), null, 'workers train at the settlement');
  const bk = ownBlds(w, 0, 'barracks')[0];
  assert.ok(bk, 'a barracks stands from the start');
  assert.ok(act(w, 0, { type: 'buy', payload: { unit: 'inf' } }));
  assert.equal(bk.queue.length, 1);
  run(w, 3);
  const inf = w.units.find((u) => u.team === 0 && u.type === 'inf')!;
  assert.ok(inf, 'infantry spawned');
  assert.ok(Math.hypot(inf.x - bk.x, inf.y - bk.y) < 40, 'near the barracks');
});

test('the age follows the settlement tier and gates buildings', () => {
  const w = conquest();
  w.slots[0].gold = 5000;
  w.slots[0].mat = 5000;
  assert.equal(ageOf(w, 0), 0);
  const p = spot(w, 'house');
  assert.match(canBuild(w, Math.round(p.x / TILE - 1.5), Math.round(p.y / TILE - 1), 0, 'range') ?? '', /age/);
  assert.ok(act(w, 0, { type: 'ageUp', payload: null }));
  const cap = w.slots[0].settlements[0];
  assert.equal(cap.tier, 'town');
  run(w, TIERS.town.buildT + 1);
  assert.equal(ageOf(w, 0), 1);
  assert.equal(w.slots[0].age, 1);
});

test('blacksmith research needs a smith and adds damage', () => {
  const w = conquest();
  w.slots[0].gold = 5000;
  w.slots[0].mat = 5000;
  assert.ok(!act(w, 0, { type: 'research', payload: { tech: 'melee' } }));
  act(w, 0, { type: 'ageUp', payload: null });
  run(w, TIERS.town.buildT + 1);
  const p = spot(w, 'smith');
  assert.ok(act(w, 0, { type: 'build', payload: { x: p.x, y: p.y, bld: 'smith' } }), w.msg);
  run(w, BLD.smith.buildT! + 1);
  assert.ok(act(w, 0, { type: 'research', payload: { tech: 'melee' } }), w.msg);
  assert.equal(w.slots[0].tech.melee, 1);
});

test('cheats: unlimited gold, instant production, and no cooldowns', () => {
  const w = newGame(BUILTIN[0], 'skirmish', { seed: 1, cheats: { gold: true, instant: true, powers: true } });
  ticks(w, 1);
  assert.equal(w.slots[0].gold, Infinity);
  assert.ok(act(w, 0, { type: 'buy', payload: { unit: 'shd' } }));
  ticks(w, 1);
  assert.equal(w.units.filter((u) => u.team === 0).length, 1);
  assert.ok(act(w, 0, { type: 'power', payload: { power: 'heal', x: w.units[0].x, y: w.units[0].y } }));
  ticks(w, 1);
  assert.ok(act(w, 0, { type: 'power', payload: { power: 'heal', x: w.units[0].x, y: w.units[0].y } }), 'no cooldown');
  assert.ok(act(w, 0, { type: 'cheats', payload: { gold: false, resources: false, instant: false, build: false, powers: false } }));
  assert.ok(Number.isFinite(w.slots[0].gold));
});

test('the rival builds a town', () => {
  const w = conquest(5);
  const home = w.slots[0].settlements[0];
  for (let i = 0; i < 8; i++) w.units.push(w.units[0] ? w.units[0] : w.units[0]);
  w.units = [];
  w.slots[0].gold = 2000;
  run(w, 300);
  const rival = w.blds.filter((b) => b.team === 1 && b.kind === 'town');
  assert.ok(rival.length >= 2, 'rival town buildings: ' + rival.map((b) => b.type).join(','));
  assert.ok(home.hp > 0 || w.slots[0].settlements.length > 0);
});
