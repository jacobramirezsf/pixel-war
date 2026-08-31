// Balance harness.
//   npm run sim -- --map=crossroads --a=aggro --b=turtle --runs=50 --seed=1
//   npm run sim -- --matrix --runs=3            every bot pair on every map
// Writes a CSV of every game to test/balance/out/ and prints a summary.

import { mkdirSync, writeFileSync } from 'node:fs';
import { BUILTIN, builtinByName } from '../src/data/maps.ts';
import { BOT_NAMES } from '../src/sim/ai/bots.ts';
import { runMatch, type MatchResult } from '../src/sim/ai/match.ts';
import type { MapDef } from '../src/sim/map.ts';
import type { DiffKey } from '../src/data/difficulty.ts';

const args = new Map<string, string>();
for (const a of process.argv.slice(2)) {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  if (m) args.set(m[1], m[2] ?? 'true');
}
const runs = +(args.get('runs') ?? 10), seed0 = +(args.get('seed') ?? 1), maxSec = +(args.get('max') ?? 480);
const matrix = args.has('matrix'), ladder = args.has('ladder');
const diffA = args.get('diffA') as DiffKey | undefined, diffB = args.get('diffB') as DiffKey | undefined;
const mapArg = args.get('map') ?? (matrix || ladder ? 'all' : 'crossroads');
const maps: MapDef[] = mapArg === 'all' ? BUILTIN.slice(0, 5) : [builtinByName(mapArg) ?? BUILTIN[0]];
const pairs: [string, string][] = [];
// Ladder: the built-in AI against itself at neighboring difficulties, both sides symmetric.
const ladderPairs: [DiffKey, DiffKey][] = [['ext', 'hard'], ['hard', 'std'], ['std', 'easy']];
if (ladder) for (const p of ladderPairs) pairs.push(['ai:' + p[0], 'ai:' + p[1]]);
else if (matrix) {
  const bots = BOT_NAMES.filter((b) => b !== 'ai');
  for (const a of bots) for (const b of bots) if (a !== b) pairs.push([a, b]);
} else pairs.push([args.get('a') ?? 'balanced', args.get('b') ?? 'ai']);

const rows: string[] = ['map,a,b,seed,winner,time,ticks,hash'];
const t0 = performance.now();
let games = 0;
const pct = (n: number): string => (100 * n).toFixed(0).padStart(3) + '%';
const median = (xs: number[]): number => { const s = xs.slice().sort((a, b) => a - b); return s.length ? s[s.length >> 1] : 0; };

console.log('map'.padEnd(12), 'a'.padEnd(9), 'b'.padEnd(9), 'a wins', 'b wins', 'draws', 'median s', 'spread s');
for (const map of maps)
  for (const [a, b] of pairs) {
    const res: MatchResult[] = [];
    for (let i = 0; i < runs; i++) {
      const da = (a.startsWith('ai:') ? a.slice(3) : diffA) as DiffKey | undefined, db = (b.startsWith('ai:') ? b.slice(3) : diffB) as DiffKey | undefined;
      const r = runMatch({ map, a: a.startsWith('ai:') ? 'ai' : a, b: b.startsWith('ai:') ? 'ai' : b, seed: seed0 + i, maxSec, diffs: da || db ? [da ?? 'std', db ?? 'std'] : undefined });
      res.push(r);
      games++;
      rows.push([map.name, a, b, seed0 + i, r.winner ?? 'draw', r.time.toFixed(1), r.ticks, r.hash].join(','));
    }
    const aw = res.filter((r) => r.winner === 0).length, bw = res.filter((r) => r.winner === 1).length, dr = res.length - aw - bw;
    const times = res.filter((r) => r.winner !== null).map((r) => r.time);
    const spread = times.length ? Math.max(...times) - Math.min(...times) : 0;
    console.log(map.name.padEnd(12), a.padEnd(9), b.padEnd(9), pct(aw / runs).padEnd(6), pct(bw / runs).padEnd(6), String(dr).padEnd(5), median(times).toFixed(0).padStart(8), spread.toFixed(0).padStart(8));
  }
const secs = (performance.now() - t0) / 1000;
mkdirSync('test/balance/out', { recursive: true });
const out = 'test/balance/out/' + (args.get('out') ?? (ladder ? 'ladder' : matrix ? 'matrix' : `${mapArg}-${pairs[0][0]}-vs-${pairs[0][1]}`)).replace(/:/g, '-') + '.csv';
writeFileSync(out, rows.join('\n') + '\n');
console.log(`${games} games in ${secs.toFixed(1)}s (${(games / secs).toFixed(1)} games/s). Wrote ${out}`);
