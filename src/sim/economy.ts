// Mines, income, and the Domination score.

import { TEAM } from '../data/teams.ts';
import type { World } from './types.ts';
import { allied, diffDef, say } from './world.ts';

/** Sandbox has no economy. */
export const hasEconomy = (w: World): boolean => w.mode !== 'sand';

/** Worker repair costs gold per tick. Free in Sandbox and with an unlimited treasury. */
export function payRepair(w: World, team: number, amt: number): boolean {
  if (w.mode === 'sand') return true;
  const s = w.slots[team];
  if (!Number.isFinite(s.gold)) return true;
  if (s.gold < amt) return false;
  s.gold -= amt;
  return true;
}

/** Mines go to whoever stands on them. Two hostile sides present means nobody owns it. */
export function mineTick(w: World): void {
  for (const m of w.mines) {
    const cnt: number[] = Array.from({ length: w.nP }, () => 0);
    for (const u of w.units) if (u.hp > 0 && Math.hypot(u.x - m.x, u.y - m.y) < 13) cnt[u.team]++;
    const present: number[] = [];
    for (let i = 0; i < w.nP; i++) if (cnt[i]) present.push(i);
    if (present.length) {
      let oneSide = true;
      for (const p of present) if (!allied(w, p, present[0])) oneSide = false;
      if (oneSide) {
        let bestI = present[0];
        for (const p of present) if (cnt[p] > cnt[bestI]) bestI = p;
        m.owner = bestI;
      } else m.owner = -1;
    }
    if (m.owner !== m.prev) {
      if (m.owner >= 0) w.fx.push({ k: 'txt', x: m.x, y: m.y - 10, t: 1.4, str: '+1.5/s', c: TEAM[m.owner] });
      if (m.owner === 0) { say(w, 'Mine captured. Income up 1.5 gold/s.', 2.2); w.incFlash = 1.6; }
      else if (m.prev === 0) {
        say(w, 'Mine lost. Income down 1.5 gold/s.', 2.2);
        w.incFlash = 1.6;
        w.fx.push({ k: 'txt', x: m.x, y: m.y - 10, t: 1.4, str: 'LOST', c: '#ff9a9a' });
      }
      m.prev = m.owner;
    }
  }
}

export function minesHeld(w: World): number[] {
  const mcount: number[] = Array.from({ length: w.nP }, () => 0);
  for (const m of w.mines) if (m.owner >= 0) mcount[m.owner]++;
  return mcount;
}

/** Player gets 2 plus 1.5 per mine. AI gets a rising base rate scaled by difficulty. */
export function incomeTick(w: World, dt: number, mcount: number[]): void {
  w.income = 2 + 1.5 * mcount[0];
  w.slots[0].gold += w.income * dt;
  const inc = diffDef(w).inc * (w.mode === 'rich' ? 2 : 1);
  for (let i = 1; i < w.nP; i++) {
    if (!w.slots[i].alive) continue;
    w.slots[i].gold += (1.4 + 0.012 * w.t + 1.5 * mcount[i]) * inc * dt;
  }
}

/** Domination: hold mines to score. First to 150 wins. */
export function dominationTick(w: World, dt: number, mcount: number[]): void {
  w.score[0] += mcount[0] * dt;
  w.score[1] += mcount[1] * dt;
  if (w.score[0] >= 150) w.over = 'win';
  else if (w.score[1] >= 150) w.over = 'lose';
}
