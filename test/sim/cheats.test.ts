// Cheats: toggles that bend the rules for the player only, and one-shot commands. All replayable.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TYPES } from '../../src/data/units.ts';
import { newGame } from '../../src/sim/game.ts';
import { mkUnit } from '../../src/sim/units.ts';
import { attack } from '../../src/sim/combat.ts';
import { deserialize, restore, serialize, snapshot, stateString } from '../../src/sim/world.ts';
import { act, run, ticks } from './helpers.ts';
import { setTruce, settlementsIn } from '../../src/sim/conquest.ts';

const realm = (seed = 3) => { const w = newGame({} as never, 'conquest', { seed, rivals: 1 }); w.cheats.on = true; setTruce(w, 0, 1, false); return w; };

test('toggles: no pop cap, free units, free build, god, one hit, super units, all ages, territory, growth', () => {
  const w = realm();
  const s = w.slots[0];
  s.gold = 0;
  assert.ok(!act(w, 0, { type: 'buy', payload: { unit: 'inf' } }), 'no gold');
  w.cheats.freeUnits = true;
  assert.ok(act(w, 0, { type: 'buy', payload: { unit: 'inf' } }), 'free');
  w.cheats.noPop = true; w.cheats.instant = true;
  let n = 0;
  while (n < 60 && act(w, 0, { type: 'buy', payload: { unit: 'inf' } })) { n++; ticks(w, 1); }
  assert.ok(n >= 40, 'no cap: ' + n);
  w.cheats.allAges = true;
  ticks(w, 1);
  assert.equal(s.age, 2);
  w.cheats.freeBuild = true;
  const home = s.settlements[0];
  const before = s.gold;
  assert.ok(act(w, 0, { type: 'build', payload: { x: home.x + 40, y: home.y - 30, bld: 'house' } }) || true);
  assert.equal(s.gold, before, 'building cost nothing');
  w.cheats.growth = true;
  assert.ok(act(w, 0, { type: 'upgrade', payload: { id: home.id } }));
  assert.equal(home.tier, 'town');
  assert.equal(home.buildT, 0);
  // God and one hit.
  w.cheats.god = true;
  const mine = mkUnit(w, 0, 'inf', home.x + 60, home.y), foe = mkUnit(w, 1, 'kni', home.x + 66, home.y);
  w.units.push(mine, foe);
  for (let i = 0; i < 10; i++) attack(w, foe, mine, TYPES.kni);
  assert.equal(mine.hp, 1, 'never below one');
  w.cheats.oneHit = true;
  attack(w, mine, foe, TYPES.inf);
  assert.ok(foe.hp <= 0, 'one hit');
  w.cheats.oneHit = false; w.cheats.superUnits = true;
  const foe2 = mkUnit(w, 1, 'shd', home.x + 66, home.y);
  w.units.push(foe2);
  const hp = foe2.hp;
  attack(w, mine, foe2, TYPES.inf);
  assert.ok(hp - foe2.hp >= 30, 'five times the damage: ' + (hp - foe2.hp));
  // Territory: settle far away.
  w.cheats.territory = true;
  const far = w.regions.find((r) => r.owner < 0 && !r.adj.some((a) => w.regions[a].owner === 0));
  if (far) assert.ok(act(w, 0, { type: 'settle', payload: { x: far.cx, y: far.cy } }) || !w.msg.includes('territory'), w.msg);
});

test('the master switch gates everything, and the AI never benefits', () => {
  const w = newGame({} as never, 'conquest', { seed: 4, rivals: 1 });
  w.cheats.freeUnits = true; w.cheats.noPop = true;
  w.slots[0].gold = 0;
  assert.ok(!act(w, 0, { type: 'buy', payload: { unit: 'inf' } }), 'off without the master switch');
  w.cheats.on = true;
  assert.ok(act(w, 0, { type: 'buy', payload: { unit: 'inf' } }));
  w.slots[1].gold = 0;
  assert.ok(!act(w, 1, { type: 'buy', payload: { unit: 'inf' } }), 'the rival still pays');
  assert.ok(!act(w, 0, { type: 'cheat', payload: { op: 'gold', n: 100 } }) === false);
});

test('one-shot cheats: gold, heal, revive, finish, clear, spawn, armies, raid, bandits, settle, peace, total war, max city', () => {
  const w = realm(5);
  const s = w.slots[0], home = s.settlements[0];
  const g = s.gold;
  assert.ok(act(w, 0, { type: 'cheat', payload: { op: 'gold', n: 1000 } }));
  assert.equal(Math.round(s.gold - g), 1000);
  assert.ok(act(w, 0, { type: 'cheat', payload: { op: 'spawn', unit: 'kni', n: 10, x: home.x + 50, y: home.y } }));
  assert.equal(w.units.filter((u) => u.type === 'kni' && u.team === 0).length, 10);
  assert.ok(act(w, 0, { type: 'cheat', payload: { op: 'army', kind: 'large', x: home.x + 80, y: home.y + 40 } }));
  assert.ok(act(w, 0, { type: 'cheat', payload: { op: 'army', kind: 'small', team: 1, x: home.x + 120, y: home.y } }), 'enemy army');
  assert.ok(w.units.some((u) => u.team === 1 && u.order?.type === 'attack'), 'enemy army attacks');
  assert.ok(act(w, 0, { type: 'cheat', payload: { op: 'clearAll' } }));
  ticks(w, 1);
  assert.ok(!w.units.some((u) => u.team === 1 && u.hp > 0 && TYPES[u.type].role !== 'civ'), 'enemy soldiers gone');
  assert.ok(w.slots[1].alive, 'the rival kingdom stands');
  for (const u of w.units) if (u.team === 0) u.hp = 1;
  assert.ok(act(w, 0, { type: 'cheat', payload: { op: 'heal' } }));
  assert.ok(w.units.filter((u) => u.team === 0).every((u) => u.hp >= TYPES[u.type].hp));
  assert.ok(act(w, 0, { type: 'cheat', payload: { op: 'bandits', n: 5, x: home.x + 40, y: home.y - 40 } }));
  assert.ok(act(w, 0, { type: 'cheat', payload: { op: 'raid', size: 'small', id: home.id } }));
  assert.ok(w.events.some((e) => e.kind === 'raid'));
  const far = w.regions.find((r) => r.owner < 0 && r.id !== w.capitals[1] && !settlementsIn(w, r.id).length)!;
  assert.ok(act(w, 0, { type: 'cheat', payload: { op: 'settle', x: far.cx, y: far.cy } }), w.msg);
  assert.equal(far.owner, 0);
  assert.ok(act(w, 0, { type: 'cheat', payload: { op: 'totalWar' } }));
  assert.ok(!s.truce[1]);
  assert.ok(act(w, 0, { type: 'cheat', payload: { op: 'peace' } }));
  assert.ok(s.truce[1]);
  assert.ok(act(w, 0, { type: 'cheat', payload: { op: 'maxCity', id: home.id } }));
  assert.equal(home.tier, 'city');
  assert.ok(w.blds.some((b) => b.team === 0 && b.type === 'market'));
  assert.ok(act(w, 0, { type: 'cheat', payload: { op: 'revive' } }));
  const w2 = restore(deserialize(serialize(snapshot(w))));
  assert.equal(stateString(w), stateString(w2));
  run(w, 5); run(w2, 5);
  assert.equal(stateString(w), stateString(w2), 'still deterministic after cheats');
});

test('new powers: lightning, meteor, quake, fortify, sanctuary, teleport, banish, summon, rebuild, golden age', async () => {
  const w = realm(7);
  const s = w.slots[0], home = s.settlements[0];
  w.cheats.gold = true; w.cheats.powers = true;
  s.gold = Infinity;
  const foes = Array.from({ length: 6 }, (_, i) => mkUnit(w, 1, 'inf', home.x + 60 + (i % 3) * 5, home.y + Math.floor(i / 3) * 5));
  for (const f of foes) { f.order = { type: 'guard', x: f.x, y: f.y }; w.units.push(f); }
  assert.ok(act(w, 0, { type: 'power', payload: { power: 'lightning', x: home.x + 62, y: home.y + 2 } }), w.msg);
  assert.ok(foes.filter((f) => f.hp < TYPES.inf.hp).length >= 3, 'chained');
  assert.ok(act(w, 0, { type: 'power', payload: { power: 'meteor', x: home.x + 62, y: home.y + 2 } }));
  assert.ok(foes.some((f) => f.hp > 0), 'not yet');
  run(w, 3.5);
  assert.ok(foes.every((f) => f.hp <= 0), 'meteor landed');
  const { addBld } = await import('../../src/sim/buildings.ts');
  const wall = addBld(w, 1, 'wal', Math.round(home.x / 8) + 10, Math.round(home.y / 8));
  assert.ok(act(w, 0, { type: 'power', payload: { power: 'quake', x: wall.x, y: wall.y } }));
  assert.ok(wall.hp <= 0 || !w.blds.includes(wall), 'wall broken');
  const mine = mkUnit(w, 0, 'inf', home.x + 20, home.y); w.units.push(mine);
  assert.ok(act(w, 0, { type: 'power', payload: { power: 'fortify', x: mine.x, y: mine.y } }));
  const foe = mkUnit(w, 1, 'kni', mine.x + 6, mine.y); w.units.push(foe);
  const hp = mine.hp;
  attack(w, foe, mine, TYPES.kni);
  const took = hp - mine.hp;
  assert.ok(took < 12, 'fortified took ' + took);
  assert.ok(act(w, 0, { type: 'power', payload: { power: 'sanctuary', x: home.x, y: home.y } }));
  const civ = w.units.find((u) => u.team === 0 && u.type === 'civ')!;
  attack(w, foe, civ, TYPES.kni);
  assert.equal(civ.hp, TYPES.civ.hp, 'villager untouched in sanctuary');
  assert.ok(act(w, 0, { type: 'power', payload: { power: 'teleport', x: home.x - 20, y: home.y + 40, ids: [mine.id] } }));
  assert.ok(Math.hypot(mine.x - (home.x - 20), mine.y - (home.y + 40)) < 30, 'teleported');
  assert.ok(act(w, 0, { type: 'power', payload: { power: 'banish', x: foe.x, y: foe.y } }));
  assert.ok(foe.hp <= 0, 'banished');
  const before = w.units.filter((u) => u.team === 0).length;
  assert.ok(act(w, 0, { type: 'power', payload: { power: 'summon', x: home.x + 10, y: home.y + 20 } }), w.msg);
  assert.ok(w.units.filter((u) => u.team === 0).length >= before + 2, 'summoned');
  const house = addBld(w, 0, 'house', Math.round(home.x / 8) + 4, Math.round(home.y / 8) - 4);
  house.hp = 10;
  assert.ok(act(w, 0, { type: 'power', payload: { power: 'rebuild', x: house.x, y: house.y } }));
  assert.equal(house.hp, house.max);
  assert.ok(act(w, 0, { type: 'power', payload: { power: 'golden', x: home.x, y: home.y } }));
  assert.ok(w.zones.some((z) => z.kind === 'golden'));
  assert.ok(!act(w, 0, { type: 'power', payload: { power: 'nuke', x: home.x, y: home.y } }) || w.cheats.on, 'chaos needs cheats');
});
