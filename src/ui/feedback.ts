// Sound and shake, driven by what the sim reports through effects and events.

import { synth } from '../audio/synth.ts';
import type { World } from '../sim/types.ts';
import type { App } from './app.ts';

let lastTick = -1, lastEvents = 0, lastBlds = 0, shakeT = 0, shakeMag = 0;

/** Play sounds for effects that started this tick and events that arrived. */
export function soundTick(app: App, w: World): void {
  if (w.tick === lastTick || !app.running) return;
  const fresh = lastTick >= 0 && w.tick - lastTick < 10;
  lastTick = w.tick;
  if (!fresh) { lastEvents = w.events.length; lastBlds = w.blds.length; return; }
  const dt = 1 / 60;
  for (const f of w.fx) {
    // An effect that started within the last tick has nearly its full time left.
    if (f.k === 'hit' && f.t > 0.14 - dt * 1.5) synth.play('attack');
    else if (f.k === 'shot' && f.t > 0.1 - dt * 1.5) synth.play('attack');
    else if (f.k === 'die' && f.t > 0.35 - dt * 1.5) synth.play('death');
    else if (f.k === 'boom' && f.r >= 20 && f.t > 0.25 - dt * 1.5) { synth.play('death'); shakeT = 0.45; shakeMag = 3; }
    else if (f.k === 'txt' && f.t > 1.4 - dt * 1.5 && (f.str === '+1.5/s' || f.str === 'LOST')) synth.play('capture');
  }
  if (w.blds.length > lastBlds) synth.play('build');
  lastBlds = w.blds.length;
  if (w.events.length > lastEvents) {
    const e = w.events[w.events.length - 1];
    if (e.kind === 'attack' || e.kind === 'war' || e.kind === 'revolt' || e.kind === 'broke') synth.play('warning');
    else if (e.kind === 'claim' || e.kind === 'built' || e.kind === 'loot') synth.play('capture');
  }
  lastEvents = w.events.length;
}

/** Decaying screen shake, in world pixels. */
export function shakeTick(app: App, _w: World, frame: number): { x: number; y: number } {
  if (shakeT <= 0 || !app.running) return { x: 0, y: 0 };
  shakeT -= frame;
  const k = Math.max(0, shakeT / 0.45) * shakeMag;
  const t = performance.now() / 18;
  return { x: Math.round(Math.sin(t) * k), y: Math.round(Math.cos(t * 1.3) * k) };
}
