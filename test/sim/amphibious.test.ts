// Sea pathing and the AI's overseas invasions.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TYPES } from '../../src/data/units.ts';
import { addBld } from '../../src/sim/buildings.ts';
import { newGame } from '../../src/sim/game.ts';
import { blankMap } from '../../src/sim/map.ts';
import { landLabels, sameLand } from '../../src/sim/pathing.ts';
import { mkUnit } from '../../src/sim/units.ts';
import { act, game, run } from './helpers.ts';
import type { World } from '../../src/sim/types.ts';

const tileOf = (w: World, x: number, y: number): number => w.map.tiles[((y / 8) | 0) * w.map.cols + ((x / 8) | 0)];

/** A bay split by a land spit: sailing across means rounding the tip. */
function spitWorld(): World {
  const w = game('sand', blankMap('Spit', 40, 40));
  w.blds = [];
  w.bmap.clear();
  for (const s of w.slots) for (const b of s.settlements) b.hp = 0;
  const cols = w.map.cols;
  for (let y = 2; y <= 26; y++) for (let x = 2; x <= 26; x++) w.map.tiles[y * cols + x] = 3;
  for (let y = 2; y <= 20; y++) w.map.tiles[y * cols + 14] = 0;
  w.flowDirty = true;
  w.phase = 'play';
  return w;
}

test('a boat ordered across a land spit sails around it', () => {
  const w = spitWorld();
  const boat = mkUnit(w, 0, 'patrol', 5 * 8 + 4, 5 * 8 + 4);
  w.units.push(boat);
  const dx = 23 * 8 + 4, dy = 5 * 8 + 4;
  assert.ok(act(w, 0, { type: 'move', payload: { ids: [boat.id], x: dx, y: dy } }));
  let arrived = false;
  run(w, 60, () => {
    if (!arrived) arrived = Math.hypot(boat.x - dx, boat.y - dy) < 12;
    assert.equal(tileOf(w, boat.x, boat.y), 3, 'never leaves the water');
  });
  assert.ok(arrived, 'rounded the spit: ' + boat.x + ',' + boat.y);
});

test('landmasses are labeled and a bridge joins them', () => {
  const w = game('sand', blankMap('Split', 40, 40));
  w.blds = [];
  w.bmap.clear();
  const cols = w.map.cols;
  for (let y = 0; y < 40; y++) for (let x = 18; x <= 20; x++) w.map.tiles[y * cols + x] = 3;
  const west = { x: 10 * 8, y: 10 * 8 }, east = { x: 30 * 8, y: 10 * 8 };
  assert.ok(!sameLand(w, west.x, west.y, east.x, east.y), 'the channel splits the map');
  assert.ok(sameLand(w, west.x, west.y, 10 * 8, 30 * 8), 'the west bank is one piece');
  const lab = landLabels(w);
  assert.equal(lab[5 * cols + 19], -1, 'water carries no label');
  for (let x = 18; x <= 20; x++) addBld(w, 0, 'bridge', x, 10);
  assert.ok(sameLand(w, west.x, west.y, east.x, east.y), 'the bridge joins the banks');
});

test('the AI mounts an amphibious invasion when its rival lives on an island', () => {
  const w = newGame({} as never, 'conquest', { seed: 3, rivals: 1 });
  const cols = w.map.cols;
  const home0 = w.slots[0].settlements[0], home1 = w.slots[1].settlements[0];
  const t0 = { x: (home0.x / 8) | 0, y: (home0.y / 8) | 0 };
  // A ring of sea around the player's corner: the capital becomes an island.
  for (let y = 0; y < w.map.rows; y++)
    for (let x = 0; x < cols; x++) {
      const d = Math.hypot(x - t0.x, y - t0.y);
      if (d >= 9 && d <= 12) w.map.tiles[y * cols + x] = 3;
    }
  w.flowDirty = true;
  // No independents: the only hostile land in reach is across the water.
  if (w.neutral >= 0) { w.slots[w.neutral].alive = false; for (const b of w.slots[w.neutral].settlements) b.hp = 0; }
  // Open war, and a rival with an army, a dock on its own shore, and a transport.
  w.slots[0].truce[1] = false; w.slots[1].truce[0] = false;
  w.slots[0].pact[1] = false; w.slots[1].pact[0] = false;
  const s1 = w.slots[1];
  s1.gold = 800; s1.mat = 200;
  // The dock goes on mainland shore beside the ring itself: a land tile touching ring water,
  // labeled with the rival's side. (Other scan orders can land on a closed river pocket.)
  let dockAt: { x: number; y: number } | null = null;
  for (let y = 1; y < w.map.rows - 1 && !dockAt; y++)
    for (let x = 1; x < cols - 1 && !dockAt; x++) {
      if (w.map.tiles[y * cols + x] !== 3) continue;
      const rd = Math.hypot(x - t0.x, y - t0.y);
      if (rd < 9 || rd > 12) continue;
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as const) {
        if (w.map.tiles[ny * cols + nx] === 3) continue;
        if (!sameLand(w, nx * 8 + 4, ny * 8 + 4, home1.x, home1.y)) continue;
        if (w.map.tiles[ny * cols + nx] === 4) continue;
        dockAt = { x: nx, y: ny };
        break;
      }
    }
  assert.ok(dockAt, 'a mainland shore exists by the ring');
  const dock = addBld(w, 1, 'dock', dockAt!.x, dockAt!.y);
  const boat = mkUnit(w, 1, 'boat', 0, 0);
  // The boat starts on ring water by the dock.
  outer: for (let y = 1; y < w.map.rows - 1; y++)
    for (let x = 1; x < cols - 1; x++)
      if (w.map.tiles[y * cols + x] === 3 && Math.hypot(x - dockAt!.x, y - dockAt!.y) < 4) { boat.x = x * 8 + 4; boat.y = y * 8 + 4; break outer; }
  boat.ox = boat.x; boat.oy = boat.y;
  w.units.push(boat);
  // Six soldiers wait by the dock.
  for (let i = 0; i < 6; i++) {
    const u = mkUnit(w, 1, 'inf', dock.x + 10 + (i % 3) * 6, dock.y + 10 + ((i / 3) | 0) * 6);
    u.held = true;
    w.units.push(u);
  }
  assert.ok(!sameLand(w, home0.x, home0.y, home1.x, home1.y), 'the capital is an island');
  let boarded = false, landed = false;
  run(w, 360, () => {
    if (!boarded) boarded = w.units.some((u) => u.aboard === boat.id);
    if (!landed) landed = w.units.some((u) => u.team === 1 && u.hp > 0 && u.aboard < 0 && !TYPES[u.type].naval && !TYPES[u.type].fly && sameLand(w, u.x, u.y, home0.x, home0.y));
    if (landed) w.over = 'win';
  });
  assert.ok(boarded, 'troops boarded the transport');
  assert.ok(landed, 'troops came ashore on the island');
});
