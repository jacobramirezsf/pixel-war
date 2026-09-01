// Headless Realm: every kingdom on AI. Prints the shape of the game every two minutes.
// Usage: node tools/realm-sim.ts [minutes] [rivals] [size] [seed]

import { newGame } from '../src/sim/game.ts';
import { step } from '../src/sim/step.ts';
import { TYPES } from '../src/data/units.ts';
import { TNAME } from '../src/data/teams.ts';
import { canGrow, relation } from '../src/sim/conquest.ts';
import { buildingsOf } from '../src/sim/civ.ts';

const minutes = +(process.argv[2] ?? 20), rivals = +(process.argv[3] ?? 2), size = (process.argv[4] ?? 'standard') as 'small' | 'standard' | 'large', seed = +(process.argv[5] ?? 11);
const w = newGame({} as never, 'conquest', { seed, rivals, size, races: ['kingdom', 'horde', 'forge', 'undead', 'wild'].slice(0, rivals + 1) as never });
w.slots[0].ai = true;
const t0 = performance.now();
let ticks = 0;
while (w.t < minutes * 60 && !w.over) {
  step(w); ticks++;
  if (w.tick % 7200 === 0) {
    const line: string[] = [];
    for (let i = 0; i < w.nP; i++) {
      const s = w.slots[i];
      if (s.neutral) continue;
      const towns = s.settlements.filter((b) => b.hp > 0).map((b) => b.tier[0]).join('');
      const army = w.units.filter((u) => u.team === i && u.hp > 0 && TYPES[u.type].role !== 'civ').reduce((a, u) => a + TYPES[u.type].cost, 0);
      const people = w.units.filter((u) => u.team === i && u.hp > 0 && TYPES[u.type].role === 'civ').length;
      const blds = w.blds.filter((b) => b.team === i).length;
      const regions = w.regions.filter((r) => r.owner === i).length;
      const rel = w.slots.map((x, j) => (j !== i && !x.neutral ? relation(w, i, j)[0] : '')).join('');
      line.push(TNAME[i] + ':' + towns + ' r' + regions + ' b' + blds + ' p' + people + ' a' + army + ' g' + (s.gold | 0) + ' net' + w.net[i].toFixed(1) + ' ' + rel);
    }
    console.log('day ' + w.day + ' | ' + line.join(' | '));
  }
}
const ms = performance.now() - t0;
console.log('over', w.over, 'ticks', ticks, 'ms', ms.toFixed(0), 'x realtime', ((ticks / 60) / (ms / 1000)).toFixed(0), 'units', w.units.length, 'blds', w.blds.length);
for (let i = 0; i < w.nP; i++) { const s = w.slots[i]; if (s.neutral) continue; for (const b of s.settlements) if (b.hp > 0 && b.tier !== 'outpost') console.log(TNAME[i], b.tier, w.regions[b.region]?.name, 'people', b.civ.residents + '/' + b.civ.housing, 'jobs', b.civ.employed + '/' + b.civ.jobs, 'blds', buildingsOf(w, b).map((x) => x.type).join(','), '| grow:', canGrow(w, b)); }
console.log('history:', w.history.slice(-12).map((h) => 'd' + h.day + ' ' + h.text).join(' / '));
