// The strategy layer runs each AI faction at its profile's reaction rate, staggered by slot
// so five factions do not all think on the same tick.

import type { World } from '../types.ts';
import { PROFILES } from './profiles.ts';
import { decide } from './strategy.ts';

export function aiTick(w: World, dt: number): void {
  // Rotate who thinks first: factions act on the world as the earlier thinkers left it, so a
  // fixed order hands the last slot a standing counter-picking edge. Rotation shares it out.
  const rot = ((w.tick / 60) | 0) % w.nP;
  for (let k = 0; k < w.nP; k++) {
    const i = (k + rot) % w.nP;
    const s = w.slots[i];
    if (!s.alive || !s.ai) continue;
    s.aiT -= dt;
    if (s.aiT > 0) continue;
    s.aiT = PROFILES[s.diff].react;
    decide(w, i);
  }
}

export { PROFILES } from './profiles.ts';
