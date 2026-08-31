// Dev only: a heavy scene for frame timing. Reached with ?bench in the URL.

import { BUILTIN } from '../data/maps.ts';
import { roster } from '../data/units.ts';
import { addBld, canBuild } from '../sim/buildings.ts';
import { TILE } from '../sim/map.ts';
import { mkUnit } from '../sim/units.ts';
import { startGame, type App } from './app.ts';

export function startBench(app: App): void {
  app.curMap = BUILTIN[6];
  startGame(app, 'multi', [0, 1, 2, 3, 4], ['kingdom', 'horde', 'undead', 'forge', 'wild']);
  const w = app.world!;
  w.cap = 100;
  const map = w.map;
  for (let s = 0; s < 5; s++) {
    const b = w.slots[s].settlements[0], list = roster(w.slots[s].race);
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * Math.PI * 2, r = 20 + (i % 5) * 6;
      const u = mkUnit(w, s, list[i % list.length], Math.max(8, Math.min(map.cols * TILE - 8, b.x + Math.cos(a) * r)), Math.max(8, Math.min(map.rows * TILE - 8, b.y + Math.sin(a) * r)));
      u.order = { type: 'attack', tgt: null };
      w.units.push(u);
    }
  }
  let n = 0;
  for (let ty = 2; ty < map.rows - 2 && n < 200; ty += 2)
    for (let tx = 2; tx < map.cols - 2 && n < 200; tx += 2)
      if (!canBuild(w, tx, ty, n % 5, 'stk')) { addBld(w, n % 5, 'stk', tx, ty); n++; }
  const frames: number[] = [];
  let last = performance.now();
  const tick = (): void => {
    const now = performance.now();
    frames.push(now - last);
    last = now;
    if (frames.length >= 120) {
      const sorted = frames.slice().sort((a, b) => a - b);
      const avg = frames.reduce((a, b) => a + b, 0) / frames.length;
      const msg = `frame avg ${avg.toFixed(1)}ms, p95 ${sorted[Math.floor(sorted.length * 0.95)].toFixed(1)}ms, ${w.units.length} units, ${w.blds.length} blds`;
      document.getElementById('msg')!.textContent = msg;
      (window as unknown as { benchResult: string }).benchResult = msg;
      frames.length = 0;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
