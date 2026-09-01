// Unit value sweep: equal gold of each unit against equal gold of soldiers and of archers in an
// open field. Prints the share of the enemy's value left standing (negative means we lost).
// Usage: node tools/value.ts [gold]

import { ALL_UNITS, TYPES, type UnitKey } from '../src/data/units.ts';
import { newGame } from '../src/sim/game.ts';
import { step } from '../src/sim/step.ts';
import { mkUnit } from '../src/sim/units.ts';
import { BUILTIN } from '../src/data/maps.ts';
import type { World } from '../src/sim/types.ts';

const GOLD = +(process.argv[2] ?? 300);
const MIN_COST = +(process.argv[3] ?? 0);

function arena(): World {
  const w = newGame(BUILTIN[0], 'sand', { seed: 7 });
  w.map.tiles.fill(0);
  w.blds = []; w.bmap.clear();
  for (const s of w.slots) for (const b of s.settlements) b.hp = 0;
  w.phase = 'play';
  return w;
}

function duel(a: UnitKey, b: UnitKey): number {
  const w = arena();
  const na = Math.max(1, Math.round(GOLD / TYPES[a].cost)), nb = Math.max(1, Math.round(GOLD / TYPES[b].cost));
  const cx = (w.map.cols * 8) / 2, cy = (w.map.rows * 8) / 2;
  for (let i = 0; i < na; i++) { const u = mkUnit(w, 0, a, cx - 40 + (i % 4) * -8, cy - 20 + Math.floor(i / 4) * 8); u.order = { type: 'attack', tgt: null, x: cx + 40, y: cy }; w.units.push(u); }
  for (let i = 0; i < nb; i++) { const u = mkUnit(w, 1, b, cx + 40 + (i % 4) * 8, cy - 20 + Math.floor(i / 4) * 8); u.order = { type: 'attack', tgt: null, x: cx - 40, y: cy }; w.units.push(u); }
  for (let t = 0; t < 60 * 90; t++) {
    step(w);
    const la = w.units.some((u) => u.team === 0 && u.hp > 0), lb = w.units.some((u) => u.team === 1 && u.hp > 0);
    if (!la || !lb) break;
  }
  // Share of each side's own spend still standing. Rounded unit counts make the spends unequal.
  const va = w.units.filter((u) => u.team === 0 && u.hp > 0).reduce((s, u) => s + TYPES[u.type].cost * (u.hp / TYPES[u.type].hp), 0);
  const vb = w.units.filter((u) => u.team === 1 && u.hp > 0).reduce((s, u) => s + TYPES[u.type].cost * (u.hp / TYPES[u.type].hp), 0);
  return va / (na * TYPES[a].cost) - vb / (nb * TYPES[b].cost);
}

const rows: string[] = [];
for (const k of ALL_UNITS) {
  const T = TYPES[k];
  if (T.role === 'civ' || T.repair || T.cost < MIN_COST) continue;
  const vs = duel(k, 'inf'), va = duel(k, 'arc'), vk = duel(k, 'kni');
  rows.push([k.padEnd(9), T.race.padEnd(8), T.role.padEnd(8), String(T.cost).padStart(4), (vs * 100).toFixed(0).padStart(6), (va * 100).toFixed(0).padStart(6), (vk * 100).toFixed(0).padStart(6), ((vs + va + vk) / 3 * 100).toFixed(0).padStart(6)].join(' '));
}
console.log('unit      race     role     cost  vsInf  vsArc  vsKni    avg');
for (const r of rows) console.log(r);
