// The prototype AI: a weighted random shopping list and timed waves.
// M5 replaces this with a real strategy layer. Kept as is for parity.

import { BLD } from '../../data/buildings.ts';
import { roster, TYPES, type UnitKey } from '../../data/units.ts';
import { addBld, canBuild } from '../buildings.ts';
import { applyCommand, cmd } from '../commands.ts';
import { rand, rnd } from '../rng.ts';
import type { World } from '../types.ts';
import { allied, diffDef, say } from '../world.ts';

/** Cheap units early, expensive ones weighted up as the match goes on. Never workers. */
export function aiPick(w: World, slot = 1): UnitKey {
  const list = roster(w.slots[slot].race);
  const wts = list.map((k) => {
    const T = TYPES[k];
    if (T.repair) return 0;
    const c = T.cost;
    return c <= 30 ? 3 : c <= 60 ? 2 : 0.4 + w.t / 90;
  });
  let r = rand(w.rng) * wts.reduce((a, b) => a + b, 0);
  for (let i = 0; i < list.length; i++) {
    r -= wts[i];
    if (r <= 0) return list[i];
  }
  return list[1];
}

/** This race's worker, or null when it has none. */
function workerOf(w: World, slot: number): UnitKey | null {
  return roster(w.slots[slot].race).find((k) => !!TYPES[k].repair) ?? null;
}

/** Buy through the command layer, then mark the unit held until the next wave. */
function aiBuy(w: World, slot: number, unit: UnitKey): boolean {
  const before = w.units.length;
  if (!applyCommand(w, cmd(w, slot, { type: 'buy', payload: { unit } }), true)) return false;
  if (w.units.length > before) w.units[w.units.length - 1].held = true;
  return true;
}

export function aiTick(w: World, dt: number): void {
  const diff = diffDef(w);
  for (let i = 0; i < w.nP; i++) {
    const s = w.slots[i];
    if (!s.alive || !s.ai) continue;
    s.aiT -= dt;
    if (s.aiT <= 0) {
      s.aiT = 0.7;
      if (!s.aiWant) s.aiWant = aiPick(w, i);
      const T = TYPES[s.aiWant];
      if (s.gold >= T.cost) { aiBuy(w, i, s.aiWant); s.aiWant = null; }
    }
  }
  w.wave -= dt;
  if (w.wave <= 0) {
    w.waveN++;
    w.wave = Math.max(diff.wave * 0.5, diff.wave - w.waveN * 1.5);
    for (let i = 0; i < w.nP; i++) {
      const s = w.slots[i];
      if (!s.alive || !s.ai) continue;
      const held = w.units.filter((u) => u.team === i && u.held);
      for (const m of w.mines) {
        if (m.owner < 0 || !allied(w, m.owner, i))
          for (let k = 0; k < 2 && held.length > 2; k++) {
            const u = held.pop()!;
            u.held = false;
            // One unit per move command keeps the prototype's per-unit scatter.
            applyCommand(w, cmd(w, i, { type: 'move', payload: { ids: [u.id], x: m.x + rnd(w.rng, -4, 4), y: m.y + rnd(w.rng, -4, 4) } }), true);
          }
      }
      for (const u of held) u.held = false;
      if (held.length) applyCommand(w, cmd(w, i, { type: 'attack', payload: { ids: held.map((u) => u.id), target: null } }), true);
      const wk = workerOf(w, i);
      if (wk && diff.wrk && s.gold >= 60 && (w.waveN === 1 || w.waveN % 3 === 0) && !w.units.some((u) => u.team === i && TYPES[u.type].repair)) aiBuy(w, i, wk);
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
