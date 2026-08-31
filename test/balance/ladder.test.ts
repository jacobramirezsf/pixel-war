// M5 acceptance. Difficulties order themselves in head-to-head AI matches, and the
// reasonable scripted strategies neither stomp nor get stomped by Standard.
// Draws count as half a win for each side. Samples are small, so the bounds are loose.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUILTIN } from '../../src/data/maps.ts';
import type { DiffKey } from '../../src/data/difficulty.ts';
import { runMatch } from '../../src/sim/ai/match.ts';

const MAPS = BUILTIN.slice(0, 5);

function share(a: DiffKey, b: DiffKey, seeds: number[]): number {
  let aw = 0, bw = 0, d = 0;
  for (const map of MAPS) for (const seed of seeds) {
    const r = runMatch({ map, a: 'ai', b: 'ai', seed, maxSec: 900, diffs: [a, b] });
    if (r.winner === 0) aw++; else if (r.winner === 1) bw++; else d++;
  }
  return (aw + d / 2) / (aw + bw + d);
}

function botWinRate(bot: string, seeds: number[]): number {
  let w = 0, n = 0;
  for (const map of MAPS) for (const seed of seeds) {
    const r = runMatch({ map, a: bot, b: 'ai', seed, maxSec: 600, diffs: ['std', 'std'] });
    n++;
    if (r.winner === 0) w++; else if (r.winner === null) w += 0.5;
  }
  return w / n;
}

test('Extreme beats Hard beats Standard beats Easy', () => {
  const seeds = [41, 42, 43];
  const eh = share('ext', 'hard', seeds), hs = share('hard', 'std', seeds), se = share('std', 'easy', seeds);
  console.log(`   ext>hard ${(eh * 100).toFixed(0)}%  hard>std ${(hs * 100).toFixed(0)}%  std>easy ${(se * 100).toFixed(0)}%`);
  assert.ok(eh > 0.55, 'ext over hard ' + eh);
  assert.ok(hs > 0.55, 'hard over std ' + hs);
  assert.ok(se > 0.7, 'std over easy ' + se);
});

test('macro strategies land between 20% and 80% against Standard', () => {
  const seeds = [51, 52];
  for (const bot of ['econ', 'balanced']) {
    const r = botWinRate(bot, seeds);
    console.log(`   ${bot} vs std: ${(r * 100).toFixed(0)}%`);
    assert.ok(r >= 0.2 && r <= 0.8, bot + ' ' + r);
  }
});
