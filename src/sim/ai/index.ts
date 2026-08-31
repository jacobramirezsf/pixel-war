// The strategy layer runs each AI faction at its profile's reaction rate, staggered by slot
// so five factions do not all think on the same tick.

import type { World } from '../types.ts';
import { PROFILES } from './profiles.ts';
import { decide } from './strategy.ts';

export function aiTick(w: World, dt: number): void {
  for (let i = 0; i < w.nP; i++) {
    const s = w.slots[i];
    if (!s.alive || !s.ai) continue;
    s.aiT -= dt;
    if (s.aiT > 0) continue;
    s.aiT = PROFILES[s.diff].react;
    decide(w, i);
  }
}

export { PROFILES } from './profiles.ts';
