import { newGame } from '../src/sim/game.ts';
import { step } from '../src/sim/step.ts';
import { cmd, applyCommand } from '../src/sim/commands.ts';
import { setTruce } from '../src/sim/conquest.ts';
import { mkUnit } from '../src/sim/units.ts';
import { tileAt } from '../src/sim/map.ts';
const w = newGame({} as never, 'conquest', { seed: 11, rivals: 2 });
w.cheats.on = true;
setTruce(w, 0, 1, false); setTruce(w, 0, 2, false);
applyCommand(w, cmd(w, 0, { type: 'cheats', payload: { ...w.cheats, oneHit: true } }));
console.log('cheats', JSON.stringify(w.cheats));
for (let ty = 6; ty <= 22; ty++) for (let tx = 6; tx <= 22; tx++) w.map.tiles[ty * w.map.cols + tx] = 0;
const a = mkUnit(w, 0, 'inf', 100, 100); w.units.push(a);
const v = mkUnit(w, 1, 'gnt', 104, 100); v.cd = 8; w.units.push(v);
console.log('tile', tileAt(w.map, 100, 100), tileAt(w.map, 104, 100));
for (let i = 0; i < 240; i++) { step(w); if (i % 30 === 0) console.log(i, 'inf', a.hp.toFixed(0), a.x.toFixed(0), a.y.toFixed(0), a.cd.toFixed(2), JSON.stringify(a.order), '| gnt', v.hp.toFixed(0), v.x.toFixed(0), v.y.toFixed(0), 'dist', Math.hypot(v.x-a.x,v.y-a.y).toFixed(1)); }
