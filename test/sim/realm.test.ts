// Realm: no end unless a goal is set, events on a clock with answers, regroup after a loss, the Wonder.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame } from '../../src/sim/game.ts';
import { act, run, ticks } from './helpers.ts';

const realm = (seed = 3, size?: 'small' | 'standard' | 'large') => newGame({} as never, 'conquest', { seed, rivals: 1, size });

test('rivals start at peace, days tick, and beating every rival is a feat, not the end', () => {
  const w = realm();
  assert.ok(w.slots[0].truce[1] && w.slots[1].truce[0]);
  for (const b of w.slots[1].settlements) b.hp = 0;
  w.regions[w.capitals[1]].owner = 0;
  w.slots[1].alive = false;
  run(w, 130);
  assert.equal(w.over, null, 'the realm goes on');
  assert.equal(w.day, 1);
  assert.ok(w.feats.includes('conqueror'), w.feats.join());
  assert.ok(w.events.some((e) => e.kind === 'feat'));
});

test('world size sets the grid regardless of rival count', () => {
  assert.equal(realm(1, 'small').map.cols, 48);
  assert.equal(realm(1, 'standard').map.cols, 64);
  assert.equal(realm(1, 'large').map.cols, 90);
  assert.equal(realm(1, 'large').regions.length, 25);
});

test('feats: kingdom for three towns, great city for a city, survivor after thirty days', () => {
  const w = realm(4);
  const s = w.slots[0];
  const cap = w.regions[w.capitals[0]];
  const nbs = w.regions.filter((r) => cap.adj.includes(r.id) && r.owner < 0).slice(0, 2);
  for (const r of nbs) { const b = { ...s.settlements[0], id: w.nextId++, x: r.cx, y: r.cy, region: r.id, tier: 'village' as const, buildT: 0, civ: { ...s.settlements[0].civ } }; s.settlements.push(b); r.owner = 0; }
  ticks(w, 2);
  assert.ok(w.feats.includes('kingdom'), w.feats.join());
  s.settlements[0].tier = 'city';
  ticks(w, 2);
  assert.ok(w.feats.includes('greatCity'));
  w.t = 30 * 120;
  ticks(w, 2);
  assert.ok(w.feats.includes('survivor'));
  assert.equal(w.feats.filter((f) => f === 'kingdom').length, 1, 'each feat once');
});

test('events fire on a clock and choices resolve', () => {
  const w = realm(5);
  w.eventT = 1;
  let sawEvent = false, sawPending = false;
  for (let i = 0; i < 60 * 400 && !sawPending; i++) {
    if (w.pending) { sawPending = true; break; }
    if (w.events.some((e) => e.kind === 'raid' || e.kind === 'unrest' || e.kind === 'claim' || e.kind === 'loot' || e.kind === 'war')) sawEvent = true;
    if (w.eventT > 5) w.eventT = 1;
    ticks(w, 1);
  }
  assert.ok(sawEvent || sawPending, 'something happened');
  if (w.pending) {
    const kind = w.pending.kind, gold = w.slots[0].gold;
    assert.ok(act(w, 0, { type: 'choose', payload: { yes: true } }));
    assert.equal(w.pending, null);
    if (kind === 'caravan') assert.equal(Math.round(w.slots[0].gold - gold), 80);
  }
});

test('losing the last settlement regroups the people instead of ending the realm', () => {
  const w = realm(7);
  const old = w.capitals[0];
  for (const b of w.slots[0].settlements) b.hp = 0;
  ticks(w, 2);
  assert.equal(w.over, null);
  assert.ok(w.slots[0].settlements.some((b) => b.hp > 0), 'a new village');
  assert.notEqual(w.capitals[0], old);
  assert.ok(w.slots[0].gold >= 300);
  assert.match(w.msg, /regroup/);
});
