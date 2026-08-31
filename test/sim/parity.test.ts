// Assertions ported from legacy/tests. The harness is gone; the checks are the same.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUILTIN } from '../../src/data/maps.ts';
import { TYPES } from '../../src/data/units.ts';
import * as C from '../../src/sim/commands.ts';
import { decodeMap, encodeMap } from '../../src/sim/map.ts';
import { connected, distField } from '../../src/sim/pathing.ts';
import { elim } from '../../src/sim/combat.ts';
import { mkUnit } from '../../src/sim/units.ts';
import { allied } from '../../src/sim/world.ts';
import { step } from '../../src/sim/step.ts';
import { DT, every, game, run, ticks } from './helpers.ts';

const px = (t: number): number => t * 8 + 4;

test('gate is two tiles, locked by default, and passes its owner without damage', () => {
  const w = game('sand');
  w.map.tiles.fill(0);
  for (let x = 1; x < 18; x++) if (x !== 9 && x !== 10) C.buildAt(w, 0, px(x), px(14), 'wal', true);
  C.buildAt(w, 0, px(9), px(14), 'gat', true);
  const gt = w.blds.find((b) => b.kind === 'gate');
  assert.ok(gt);
  assert.equal(gt.tiles.length, 2);
  assert.equal(gt.locked, true);
  for (let i = 0; i < 4; i++) C.placeUnit(w, 0, 'kni', 40 + i * 12, 150);
  C.placeUnit(w, 1, 'inf', 75, 20);
  assert.ok(C.startBattle(w));
  run(w, 30);
  const g2 = w.blds.find((b) => b.kind === 'gate');
  assert.ok(w.units.filter((u) => u.team === 0 && u.y < 110).length > 0, 'own units pass own locked gate');
  assert.ok(g2 && g2.hp === g2.max, 'gate undamaged by own units');
});

test('gate auto-orients vertical between walls', () => {
  const w = game('sand');
  w.map.tiles.fill(0);
  C.buildAt(w, 0, px(6), px(9), 'wal', true);
  C.buildAt(w, 0, px(6), px(12), 'wal', true);
  C.buildAt(w, 0, px(6), px(10), 'gat', true);
  const vg = w.blds.find((b) => b.kind === 'gate');
  assert.equal(vg?.dir, 'v');
});

test('worker repairs a damaged wall', () => {
  const w = game('skirmish');
  w.slots[0].gold = 200;
  assert.equal(C.buildAt(w, 0, px(10), px(20), 'wal', false), null);
  const wall = w.blds.find((b) => b.team === 0 && b.type === 'wal')!;
  wall.hp = 40;
  assert.ok(C.buyUnit(w, 0, 'wrk'));
  run(w, 40);
  assert.ok(wall.hp > 40, 'hp ' + Math.round(wall.hp) + '/' + wall.max);
});

test('sandbox replay and mirror keep gates', () => {
  const w = game('sand');
  for (let dx = -3; dx <= 3; dx++) if (dx !== 0 && dx !== 1) C.buildAt(w, 1, px(10 + dx), px(6), 'wal', true);
  C.buildAt(w, 1, px(10), px(6), 'gat', true);
  C.placeUnit(w, 0, 'inf', 60, 150);
  assert.ok(C.startBattle(w));
  assert.ok(w.blds.some((b) => b.kind === 'gate'), 'gate survives replay');
  C.toEdit(w);
  C.mirror(w, 1);
  const gates = w.blds.filter((b) => b.kind === 'gate');
  assert.equal(gates.length, 2, gates.map((b) => b.team + '@' + b.tx + ',' + b.ty + b.dir).join(' '));
  assert.equal(w.bmap.size, w.blds.reduce((a, b) => a + b.tiles.length, 0), 'bmap consistent');
});

function bot(w: import('../../src/sim/types.ts').World, t: number): void {
  if (t < 25) {
    if (w.slots[0].gold >= 35) C.buyUnit(w, 0, t % 2 < 1 ? 'shd' : 'arc');
    if (every(t, 8)) {
      w.units.forEach((u) => { u.sel = u.team === 0; });
      const m = w.mines[((t / 8) | 0) % Math.max(1, w.mines.length)];
      if (m) C.tap(w, 0, m.x, m.y);
    }
    return;
  }
  const mix = t < 90 ? ['shd', 'xbw', 'arc', 'med'] : ['mor', 'shd', 'snp', 'med', 'xbw', 'shd'];
  const k = mix[((t * 2) | 0) % mix.length] as keyof typeof TYPES;
  if (w.slots[0].gold >= TYPES[k].cost) C.buyUnit(w, 0, k);
  if (every(t, 15) && t > 100) C.charge(w, 0);
}

test('skirmish is winnable by a competent bot and not by a blind rush', () => {
  let wins = 0;
  for (const n of ['Crossroads', 'Riverlands', 'Highlands', 'Arena']) {
    const w = game('skirmish', n);
    const t = run(w, 480, (tt) => bot(w, tt));
    if (w.over === 'win') wins++;
    console.log('   ' + n.padEnd(11), w.over, 'at', t.toFixed(0) + 's');
  }
  assert.ok(wins >= 2, wins + '/4 wins');
  const w = game('skirmish');
  const rt = run(w, 300, (t) => { if (w.slots[0].gold >= 20) C.buyUnit(w, 0, 'inf'); if (every(t, 12)) C.charge(w, 0); });
  assert.equal(w.over, 'lose', 'blind rush at ' + rt.toFixed(0) + 's');
});

test('map code round trip', () => {
  const src = BUILTIN[2];
  const back = decodeMap(encodeMap(src));
  assert.equal(back.cols, src.cols);
  assert.equal(back.rows, src.rows);
  assert.ok(connected(back));
  assert.deepEqual(Array.from(back.tiles), Array.from(src.tiles));
});

test('difficulty changes AI output', () => {
  const out: Record<string, { units: number; blds: number }> = {};
  for (const d of ['easy', 'std', 'hard', 'ext'] as const) {
    const w = game('skirmish', BUILTIN[0], { diff: d });
    run(w, 150);
    out[d] = { units: w.units.filter((u) => u.team === 1).length, blds: w.blds.filter((b) => b.team === 1).length };
  }
  console.log('   difficulty @150s:', JSON.stringify(out));
  assert.ok(out.easy.blds <= out.ext.blds, 'easy fort <= ext fort');
});

test('five-way free for all places and connects all bases', () => {
  const w = game('multi', 'Highlands', { allies: [0, 1, 2, 3, 4] });
  assert.equal(w.slots.length, 5);
  assert.equal(w.map.bases.length, 5);
  const d = distField(w.map, w.map.bases[0].tx, w.map.bases[0].ty);
  let reach = 0;
  for (let i = 0; i < 5; i++) { const b = w.map.bases[i]; if (d[b.ty * w.map.cols + b.tx] < Infinity) reach++; }
  assert.equal(reach, 5);
  const t = run(w, 400);
  console.log('   ffa ended:', w.over, 'at', t.toFixed(0) + 's', 'alive=' + w.slots.map((s) => (s.alive ? 1 : 0)).join(''));
  assert.ok(w.slots.some((s) => !s.alive) || w.over !== null, 'ffa produced eliminations');
});

test('teams mode: allies never target each other', () => {
  const w = game('multi', BUILTIN[0], { allies: [0, 0, 1, 1] });
  assert.equal(allied(w, 0, 1), true);
  assert.equal(allied(w, 0, 2), false);
  run(w, 120);
  let friendlyFire = false;
  for (const u of w.units) if (u.order && u.order.type === 'attack' && u.order.tgt && allied(w, u.team, u.order.tgt.team)) friendlyFire = true;
  assert.equal(friendlyFire, false);
});

test('elimination clears one slot and leaves the others', () => {
  const w = game('multi', BUILTIN[0], { allies: [0, 1, 2] });
  run(w, 30);
  const before = w.units.filter((u) => u.team === 2).length + w.blds.filter((b) => b.team === 2).length;
  elim(w, 2);
  const after = w.units.filter((u) => u.team === 2 && u.hp > 0).length + w.blds.filter((b) => b.team === 2).length;
  assert.equal(after, 0, 'before=' + before + ' after=' + after);
  assert.ok(w.slots[0].alive && w.slots[1].alive);
});

test('mine capture and loss update income, message, flash, and float text', () => {
  const w = game('skirmish', 'Skirmish');
  const mine = w.mines[0];
  for (let i = 0; i < 3; i++) w.units.push(mkUnit(w, 0, 'inf', mine.x + i * 3 - 3, mine.y));
  let n = 0;
  while (mine.owner !== 0 && n < 300) { step(w, DT); n++; }
  assert.equal(mine.owner, 0, 'captured after ' + n + ' ticks');
  assert.ok(Math.abs(w.income - 3.5) < 0.01, 'income=' + w.income);
  assert.match(w.msg, /captured/i);
  assert.ok(w.incFlash > 0, 'income flash set');
  assert.ok(w.fx.some((f) => f.k === 'txt'), 'float text queued');
  ticks(w, 150);
  assert.ok(w.incFlash <= 0, 'flash expires');
  assert.ok(!w.fx.some((f) => f.k === 'txt'), 'float text expires');
  for (const u of w.units) if (u.team === 0) u.hp = 0;
  step(w, DT);
  for (let i = 0; i < 3; i++) w.units.push(mkUnit(w, 1, 'inf', mine.x + i * 3 - 3, mine.y));
  n = 0;
  while (mine.owner !== 1 && n < 300) { step(w, DT); n++; }
  assert.equal(mine.owner, 1);
  assert.match(w.msg, /lost/i);
  assert.ok(Math.abs(w.income - 2) < 0.01, 'income back to 2');
  assert.ok(w.incFlash > 0, 'flash set on loss');
  assert.ok(w.fx.some((f) => f.k === 'txt' && f.str === 'LOST'), 'lost float text');
});
