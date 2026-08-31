// The prototype AI: a weighted random shopping list and timed waves.
// M5 replaces this with a real strategy layer. Kept as is for parity.

import { BLD } from '../../data/buildings.ts';
import { ORDER, TYPES, type UnitKey } from '../../data/units.ts';
import { addBld, canBuild } from '../buildings.ts';
import { rand, rnd } from '../rng.ts';
import type { World } from '../types.ts';
import { spawn } from '../units.ts';
import { allied, diffDef, say } from '../world.ts';

/** Cheap units early, expensive ones weighted up as the match goes on. Never workers. */
export function aiPick(w: World): UnitKey {
  const wts = ORDER.map((k) => {
    const T = TYPES[k];
    if (T.repair) return 0;
    const c = T.cost;
    return c <= 30 ? 3 : c <= 60 ? 2 : 0.4 + w.t / 90;
  });
  let r = rand(w.rng) * wts.reduce((a, b) => a + b, 0);
  for (let i = 0; i < ORDER.length; i++) {
    r -= wts[i];
    if (r <= 0) return ORDER[i];
  }
  return 'inf';
}

export function aiTick(w: World, dt: number): void {
  const diff = diffDef(w);
  for (let i = 1; i < w.nP; i++) {
    const s = w.slots[i];
    if (!s.alive) continue;
    s.aiT -= dt;
    if (s.aiT <= 0) {
      s.aiT = 0.7;
      if (!s.aiWant) s.aiWant = aiPick(w);
      const T = TYPES[s.aiWant];
      if (s.gold >= T.cost) {
        const u = spawn(w, i, s.aiWant);
        if (u) { s.gold -= T.cost; u.held = true; }
        s.aiWant = null;
      }
    }
  }
  w.wave -= dt;
  if (w.wave <= 0) {
    w.waveN++;
    w.wave = Math.max(diff.wave * 0.5, diff.wave - w.waveN * 1.5);
    for (let i = 1; i < w.nP; i++) {
      const s = w.slots[i];
      if (!s.alive) continue;
      const held = w.units.filter((u) => u.team === i && u.held);
      for (const m of w.mines) {
        if (m.owner < 0 || !allied(w, m.owner, i))
          for (let k = 0; k < 2 && held.length > 2; k++) {
            const u = held.pop()!;
            u.held = false;
            u.order = { type: 'move', x: m.x + rnd(w.rng, -4, 4), y: m.y + rnd(w.rng, -4, 4) };
          }
      }
      for (const u of held) { u.held = false; u.order = { type: 'attack', tgt: null }; }
      if (diff.wrk && s.gold >= 60 && (w.waveN === 1 || w.waveN % 3 === 0) && !w.units.some((u) => u.team === i && TYPES[u.type].repair)) {
        const u = spawn(w, i, 'wrk');
        if (u) { s.gold -= TYPES.wrk.cost; u.held = true; }
      }
      if (s.gold >= BLD.stt.cost + 60 && rand(w.rng) < diff.twrC) {
        const mb = w.map.bases[i];
        for (let k = 0; k < 14; k++) {
          const tx = mb.tx + ((rand(w.rng) * 11) | 0) - 5, ty = mb.ty + ((rand(w.rng) * 7) | 0) - 3;
          if (!canBuild(w, tx, ty, i, 'stt')) { addBld(w, i, 'stt', tx, ty); s.gold -= BLD.stt.cost; break; }
        }
      }
    }
    say(w, 'WAVE ' + w.waveN + ' INCOMING', 2.5);
  }
}
