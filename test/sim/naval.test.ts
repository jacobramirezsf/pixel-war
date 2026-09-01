// Boats, docks, transports, trucks, helicopters, flak.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TYPES } from '../../src/data/units.ts';
import { canBuild, passableFor } from '../../src/sim/buildings.ts';
import { newGame } from '../../src/sim/game.ts';
import { mkUnit } from '../../src/sim/units.ts';
import { attack } from '../../src/sim/combat.ts';
import { act, run, ticks } from './helpers.ts';
import type { World } from '../../src/sim/types.ts';

/** A realm with a square lake east of home, three tiles wide, six long. Returns the lake's top-left tile. */
function lakeRealm(seed = 5): { w: World; lx: number; ly: number } {
  const w = newGame({} as never, 'conquest', { seed, rivals: 1 });
  w.slots[0].gold = 9000; w.slots[0].mat = 9000; w.cheats.on = true; w.cheats.build = true; w.cheats.instant = true;
  const home = w.slots[0].settlements[0], cols = w.map.cols;
  const lx = Math.round(home.x / 8) + 6, ly = Math.round(home.y / 8) - 3;
  for (let y = ly - 1; y <= ly + 6; y++) for (let x = lx - 3; x <= lx + 4; x++) w.map.tiles[y * cols + x] = (x >= lx && x < lx + 3 && y >= ly && y < ly + 6) ? 3 : 0;
  w.flowDirty = true;
  return { w, lx, ly };
}

test('docks need a shore, launch boats onto the water, and boats stay on it', () => {
  const { w, lx, ly } = lakeRealm();
  const home = w.slots[0].settlements[0];
  assert.ok(canBuild(w, Math.round(home.x / 8) - 2, Math.round(home.y / 8) - 6, 0, 'dock'), 'no shore inland');
  assert.ok(act(w, 0, { type: 'build', payload: { x: (lx - 2) * 8 + 8, y: (ly + 1) * 8 + 8, bld: 'dock' } }), w.msg);
  const dock = w.blds.find((b) => b.type === 'dock')!;
  assert.ok(dock);
  assert.ok(act(w, 0, { type: 'buy', payload: { unit: 'patrol' } }), w.msg);
  ticks(w, 2);
  const boat = w.units.find((u) => u.type === 'patrol')!;
  assert.ok(boat, 'launched');
  assert.equal(w.map.tiles[((boat.y / 8) | 0) * w.map.cols + ((boat.x / 8) | 0)], 3, 'on water');
  boat.order = { type: 'move', x: home.x, y: home.y };
  run(w, 4);
  assert.equal(w.map.tiles[((boat.y / 8) | 0) * w.map.cols + ((boat.x / 8) | 0)], 3, 'still on water after trying to sail inland');
  assert.ok(!act(w, 0, { type: 'buy', payload: { unit: 'destroyer' } }), 'destroyer needs a port');
  assert.match(w.msg, /port/i);
});

test('a transport carries soldiers across water and sets them down on the far shore', () => {
  const { w, lx, ly } = lakeRealm(6);
  const boat = mkUnit(w, 0, 'boat', lx * 8 + 4, (ly + 2) * 8 + 4);
  w.units.push(boat);
  const ids: number[] = [];
  for (let i = 0; i < 3; i++) { const u = mkUnit(w, 0, 'inf', (lx - 2) * 8 + 4, (ly + 2) * 8 + 4 + i * 3); w.units.push(u); ids.push(u.id); }
  assert.ok(act(w, 0, { type: 'board', payload: { ids, transport: boat.id } }), w.msg);
  run(w, 4);
  const aboard = w.units.filter((u) => u.aboard === boat.id);
  assert.equal(aboard.length, 3, 'all aboard');
  assert.ok(!passableFor(w, 0, boat.x, boat.y), 'riders sit on water with the boat');
  const farX = (lx + 4) * 8 + 4, farY = (ly + 2) * 8 + 4;
  assert.ok(act(w, 0, { type: 'unload', payload: { ids: [boat.id], x: farX, y: farY } }));
  run(w, 8);
  const off = w.units.filter((u) => ids.includes(u.id) && u.aboard < 0 && u.hp > 0);
  assert.equal(off.length, 3, 'everyone ashore');
  for (const u of off) { assert.ok(u.x > (lx + 2) * 8 + 4, 'on the far side: ' + u.x); assert.ok(passableFor(w, 0, u.x, u.y), 'on land'); }
  // A sunk transport takes its riders with it.
  const boat2 = mkUnit(w, 0, 'boat', lx * 8 + 4, (ly + 4) * 8 + 4); w.units.push(boat2);
  const rider = mkUnit(w, 0, 'inf', boat2.x, boat2.y); rider.aboard = boat2.id; w.units.push(rider);
  boat2.hp = 0;
  ticks(w, 2);
  assert.ok(rider.hp <= 0, 'lost with the boat');
});

test('trucks and helicopters carry troops on land and over anything; flak punishes aircraft', () => {
  const w = newGame({} as never, 'conquest', { seed: 7, rivals: 1 });
  const home = w.slots[0].settlements[0];
  const truck = mkUnit(w, 0, 'truck', home.x + 30, home.y); w.units.push(truck);
  const ids: number[] = [];
  for (let i = 0; i < 2; i++) { const u = mkUnit(w, 0, 'inf', home.x + 20, home.y + i * 4); w.units.push(u); ids.push(u.id); }
  assert.ok(act(w, 0, { type: 'board', payload: { ids, transport: truck.id } }));
  run(w, 3);
  assert.equal(w.units.filter((u) => u.aboard === truck.id).length, 2);
  assert.ok(!act(w, 0, { type: 'board', payload: { ids: [ids[0]], transport: truck.id } }), 'riders cannot be ordered');
  const heli = mkUnit(w, 0, 'heli', home.x, home.y); w.units.push(heli);
  const flak = mkUnit(w, 1, 'flak', home.x + 10, home.y); w.units.push(flak);
  const hp = heli.hp;
  attack(w, flak, heli, TYPES.flak);
  assert.ok(hp - heli.hp >= TYPES.flak.dmg * 2.5, 'flak hits aircraft hard: ' + (hp - heli.hp));
  const inf = mkUnit(w, 1, 'inf', home.x + 10, home.y + 4); w.units.push(inf);
  const hp2 = heli.hp;
  attack(w, flak, inf, TYPES.flak);
  assert.ok(TYPES.inf.hp - inf.hp < 20, 'plain damage on the ground');
  assert.equal(heli.hp, hp2);
});
