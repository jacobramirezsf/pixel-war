// Snapshot and restore must be lossless: a restored world continues exactly like one that was never interrupted.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { BUILTIN } from '../../src/data/maps.ts';
import * as C from '../../src/sim/commands.ts';
import { deserialize, restore, serialize, snapshot, stateHash } from '../../src/sim/world.ts';
import { game, ticks } from './helpers.ts';

test('restore then 600 ticks equals an uninterrupted run', () => {
  for (const [mode, map] of [['skirmish', BUILTIN[0]], ['multi', BUILTIN[3]], ['rich', BUILTIN[2]]] as const) {
    const a = game(mode, map, mode === 'multi' ? { allies: [0, 1, 2] } : undefined);
    C.buyUnit(a, 0, 'inf');
    C.buyUnit(a, 0, 'arc');
    ticks(a, 200);
    C.selectAll(a, 0);
    C.charge(a, 0);
    ticks(a, 40);
    const text = serialize(snapshot(a));
    const b = restore(deserialize(text));
    assert.equal(stateHash(a), stateHash(b), mode + ': restored state differs before stepping');
    ticks(a, 600);
    ticks(b, 600);
    assert.equal(stateHash(a), stateHash(b), mode + ': runs diverged after restore');
    assert.ok(a.t > 10);
  }
});

test('snapshot carries an unlimited treasury through JSON', () => {
  const w = game('rich');
  const b = restore(deserialize(serialize(snapshot(w))));
  assert.equal(b.slots[0].gold, Infinity);
});

test('snapshot keeps target references', () => {
  const w = game('skirmish');
  C.buyUnit(w, 0, 'inf');
  ticks(w, 5);
  const enemyBase = w.slots[1].settlements[0];
  C.selectAll(w, 0);
  C.tap(w, 0, enemyBase.x, enemyBase.y);
  const u = w.units[0];
  assert.ok(u.order && u.order.type === 'attack' && u.order.tgt === enemyBase);
  const b = restore(snapshot(w));
  const u2 = b.units[0];
  assert.ok(u2.order && u2.order.type === 'attack' && u2.order.tgt === b.slots[1].settlements[0]);
});

function walk(dir: string, out: string[]): void {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.ts')) out.push(p);
  }
}

test('src/sim and src/data reference no browser globals, clocks, or Math.random', () => {
  const files: string[] = [];
  walk('src/sim', files);
  walk('src/data', files);
  const banned = /\b(document|window|navigator|localStorage|sessionStorage|requestAnimationFrame|performance\.now|Date\.now|new Date|Math\.random|HTMLElement|CanvasRenderingContext2D)\b/;
  for (const f of files) {
    const src = readFileSync(f, 'utf8').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
    const m = src.match(banned);
    assert.equal(m, null, f + ' uses ' + (m && m[0]));
  }
  assert.ok(files.length > 10);
});
