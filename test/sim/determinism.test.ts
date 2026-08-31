// Same seed and command log, same final state. Twenty times.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUILTIN } from '../../src/data/maps.ts';
import { runMatch } from '../../src/sim/ai/match.ts';
import { BOTS } from '../../src/sim/ai/bots.ts';
import { runBots } from '../../src/sim/ai/match.ts';
import { recordReplay, runReplay, setupWorld, type GameSetup } from '../../src/sim/replay.ts';
import { stateHash } from '../../src/sim/world.ts';

test('20 runs of the same seed produce one hash', () => {
  const hashes = new Set<string>();
  for (let i = 0; i < 20; i++) hashes.add(runMatch({ map: BUILTIN[0], a: 'balanced', b: 'ai', seed: 7, maxSec: 90 }).hash);
  assert.equal(hashes.size, 1, [...hashes].join(' '));
});

test('different seeds produce different hashes', () => {
  const a = runMatch({ map: BUILTIN[0], a: 'aggro', b: 'ai', seed: 1, maxSec: 60 }).hash;
  const b = runMatch({ map: BUILTIN[0], a: 'aggro', b: 'ai', seed: 2, maxSec: 60 }).hash;
  assert.notEqual(a, b);
});

test('replay from seed plus log reproduces the game', () => {
  const setup: GameSetup = { seed: 42, mode: 'skirmish', map: BUILTIN[1], allies: [0, 1], diff: 'hard', ai: [false, true], races: ['forge', 'horde'] };
  const w = setupWorld(setup);
  runBots(w, [BOTS.econ, BOTS.ai], 60 * 120);
  const r = recordReplay(w, setup);
  assert.ok(r.commands.length > 10, 'log has commands: ' + r.commands.length);
  const text = JSON.stringify(r);
  assert.ok(text.length < 64 * 1024, 'replay is small: ' + text.length + ' bytes');
  const w2 = runReplay(JSON.parse(text));
  assert.equal(stateHash(w2), stateHash(w));
});
