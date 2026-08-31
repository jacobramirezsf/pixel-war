// Headless performance check: 5 slots, about 300 units, 200 buildings. Prints ticks per second
// and the real-time multiple. Usage: node tools/bench.ts [seconds]

import { BUILTIN } from '../src/data/maps.ts';
import { roster } from '../src/data/units.ts';
import { addBld } from '../src/sim/buildings.ts';
import { newGame } from '../src/sim/game.ts';
import { step } from '../src/sim/step.ts';
import { mkUnit } from '../src/sim/units.ts';
import { TILE } from '../src/sim/map.ts';
import { canBuild } from '../src/sim/buildings.ts';

const secs = +(process.argv[2] ?? 10);
const map = BUILTIN[6];
const w = newGame(map, 'multi', { seed: 3, allies: [0, 1, 2, 3, 4], races: ['kingdom', 'horde', 'undead', 'forge', 'wild'], ai: [false, false, false, false, false] });
w.cap = 100;
// 60 units per slot, spread around each base, all told to charge.
for (let s = 0; s < 5; s++) {
  const b = w.slots[s].settlements[0], list = roster(w.slots[s].race);
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2, r = 20 + (i % 5) * 6;
    const u = mkUnit(w, s, list[i % list.length], Math.max(8, Math.min(map.cols * TILE - 8, b.x + Math.cos(a) * r)), Math.max(8, Math.min(map.rows * TILE - 8, b.y + Math.sin(a) * r)));
    u.order = { type: 'attack', tgt: null };
    w.units.push(u);
  }
}
// 200 buildings: stakes scattered on open ground.
let n = 0;
for (let ty = 2; ty < map.rows - 2 && n < 200; ty += 2)
  for (let tx = 2; tx < map.cols - 2 && n < 200; tx += 3)
    if (!canBuild(w, tx, ty, n % 5, 'stk')) { addBld(w, n % 5, 'stk', tx, ty); n++; }
const units0 = w.units.length, blds0 = w.blds.length;
const ticks = secs * 60;
const t0 = performance.now();
for (let i = 0; i < ticks; i++) step(w);
const dt = (performance.now() - t0) / 1000;
console.log(`start: ${units0} units, ${blds0} buildings on ${map.name}. end: ${w.units.length} units.`);
console.log(`${ticks} ticks in ${dt.toFixed(2)}s = ${(ticks / dt).toFixed(0)} ticks/s = ${(ticks / dt / 60).toFixed(1)}x real time`);
