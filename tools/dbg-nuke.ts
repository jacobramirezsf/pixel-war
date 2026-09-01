import { newGame } from '../src/sim/game.ts';
import { step } from '../src/sim/step.ts';
import { act, run } from '../test/sim/helpers.ts';
import { deserialize, restore, serialize, snapshot, stateString } from '../src/sim/world.ts';
const w = newGame({} as never, 'conquest', { seed: 5, rivals: 2 });
w.cheats.on = true; w.cheats.gold = true; w.cheats.powers = true;
const home = w.slots[0].settlements[0];
act(w, 0, { type: 'cheat', payload: { op: 'maxCity', id: home.id } });
act(w, 0, { type: 'cheat', payload: { op: 'army', kind: 'large', x: home.x + 40, y: home.y + 40 } });
run(w, 5);
console.log('units', w.units.length, 'blds', w.blds.length);
const t0 = performance.now();
console.log('nuke', act(w, 0, { type: 'power', payload: { power: 'nuke', x: home.x, y: home.y } }), w.msg);
try {
  for (let i = 0; i < 60 * 6; i++) { step(w); if (i % 60 === 0) console.log('t', w.t.toFixed(1), 'units', w.units.length, 'blds', w.blds.length, 'settle', w.slots[0].settlements.map((b) => b.hp | 0).join(','), 'over', w.over, 'gold', w.slots[0].gold, 'ms', (performance.now() - t0).toFixed(0)); }
} catch (e) { console.log('STEP THREW', e); }
try {
  const text = serialize(snapshot(w));
  console.log('save bytes', text.length);
  const w2 = restore(deserialize(text));
  console.log('restore ok', stateString(w) === stateString(w2));
  run(w2, 3);
  console.log('post-restore ok');
} catch (e) { console.log('SAVE/RESTORE THREW', e); }
