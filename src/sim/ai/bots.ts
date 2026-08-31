// Scripted opponents for the balance harness. A bot is a strategy object that turns the
// world it can see into commands for its slot. Bots run every BOT_PERIOD ticks.

import { TYPES, type UnitKey } from '../../data/units.ts';
import type { BldKey } from '../../data/buildings.ts';
import { canBuild } from '../buildings.ts';
import { cmd } from '../commands.ts';
import { TILE } from '../map.ts';
import { idsOf, unitsOf } from '../queries.ts';
import type { Command, World } from '../types.ts';
import { primaryBase } from '../world.ts';

export const BOT_PERIOD = 30;

export interface Bot {
  name: string;
  act(w: World, slot: number): Command[];
}

const buy = (w: World, slot: number, unit: UnitKey): Command => cmd(w, slot, { type: 'buy', payload: { unit } });
const chargeAll = (w: World, slot: number): Command => cmd(w, slot, { type: 'attack', payload: { ids: idsOf(unitsOf(w, slot)), target: null } });
const sec = (w: World): number => w.t;

function nearestMine(w: World, slot: number): { x: number; y: number } | null {
  const b = primaryBase(w, slot);
  let best = null, bd = Infinity;
  for (const m of w.mines) {
    if (m.owner === slot) continue;
    const d = Math.hypot(m.x - b.x, m.y - b.y);
    if (d < bd) { bd = d; best = m; }
  }
  return best;
}

/** Spend down a list in order, buying whatever is affordable. */
function spend(w: World, slot: number, list: UnitKey[]): Command[] {
  const out: Command[] = [];
  if (w.slots[slot].queue.length >= 4) return out;
  let gold = w.slots[slot].gold;
  for (const k of list) if (gold >= TYPES[k].cost) { out.push(buy(w, slot, k)); gold -= TYPES[k].cost; }
  return out;
}

/** Wall line two tiles in front of the base, towers behind it. */
function fortify(w: World, slot: number, wall: BldKey, tower: BldKey): Command[] {
  const out: Command[] = [];
  const mb = w.map.bases[slot], b = primaryBase(w, slot);
  const dv = b.y < (w.map.rows * TILE) / 2 ? 1 : -1, gy = mb.ty + dv * 3;
  let gold = w.slots[slot].gold;
  for (let dx = -4; dx <= 4; dx++) {
    if (dx === 0) continue;
    const tx = mb.tx + dx;
    const D = dx === -1 || dx === 1 ? tower : wall;
    if (tx < 1 || tx >= w.map.cols - 1) continue;
    if (canBuild(w, tx, gy, slot, D)) continue;
    const cost = D === tower ? 40 : 6;
    if (gold < cost) break;
    gold -= cost;
    out.push(cmd(w, slot, { type: 'build', payload: { x: tx * TILE + 4, y: gy * TILE + 4, bld: D } }));
  }
  return out;
}

export const BOTS: Record<string, Bot> = {
  /** The built-in AI. The world drives it; the bot issues nothing. */
  ai: { name: 'ai', act: () => [] },

  /** Melee heavy with a little ranged support, sent in packs of eight. */
  aggro: {
    name: 'aggro',
    act(w, slot) {
      const t = sec(w);
      const out = spend(w, slot, t < 60 ? ['brk', 'spr', 'inf', 'arc'] : ['kni', 'brk', 'shd', 'mor', 'bmb', 'arc']);
      const idle = unitsOf(w, slot).filter((u) => !u.order);
      if (idle.length >= 10) out.push(cmd(w, slot, { type: 'attack', payload: { ids: idsOf(idle), target: null } }));
      return out;
    },
  },

  /** Walls and towers first, then ranged mass, then one big push. */
  turtle: {
    name: 'turtle',
    act(w, slot) {
      const t = sec(w), n = unitsOf(w, slot).length;
      const out: Command[] = [];
      if (t < 60) out.push(...fortify(w, slot, 'stk', 'twr'));
      if (t < 20) {
        out.push(...spend(w, slot, ['sct']));
        const m = nearestMine(w, slot), scouts = unitsOf(w, slot).filter((u) => u.type === 'sct' && !u.order);
        if (m && scouts.length) out.push(cmd(w, slot, { type: 'move', payload: { ids: idsOf(scouts), x: m.x, y: m.y } }));
      }
      out.push(...spend(w, slot, t < 90 ? ['xbw', 'arc', 'shd'] : ['mor', 'xbw', 'shd', 'med', 'tnk']));
      if (n >= 14 && Math.floor(t) % 20 === 0) out.push(chargeAll(w, slot));
      return out;
    },
  },

  /** Scouts to the mines early, then a balanced army that pushes late. */
  econ: {
    name: 'econ',
    act(w, slot) {
      const t = sec(w);
      const out: Command[] = [];
      if (t < 30) {
        out.push(...spend(w, slot, ['sct', 'sct']));
        const m = nearestMine(w, slot);
        const scouts = unitsOf(w, slot).filter((u) => u.type === 'sct' && !u.order);
        if (m && scouts.length) out.push(cmd(w, slot, { type: 'move', payload: { ids: idsOf(scouts), x: m.x, y: m.y } }));
        return out;
      }
      out.push(...spend(w, slot, t < 120 ? ['shd', 'arc', 'kni', 'med'] : ['tnk', 'snp', 'shd', 'med', 'mor']));
      if (t > 100 && Math.floor(t) % 25 === 0) out.push(chargeAll(w, slot));
      return out;
    },
  },

  /** The prototype's competent test bot: shields and archers, then siege. */
  balanced: {
    name: 'balanced',
    act(w, slot) {
      const t = sec(w);
      const out: Command[] = [];
      if (t < 25) {
        out.push(...spend(w, slot, ['shd', 'arc']));
        if (Math.floor(t) % 8 === 0) {
          const m = nearestMine(w, slot);
          if (m) out.push(cmd(w, slot, { type: 'move', payload: { ids: idsOf(unitsOf(w, slot)), x: m.x, y: m.y } }));
        }
        return out;
      }
      out.push(...spend(w, slot, t < 90 ? ['shd', 'xbw', 'arc', 'med'] : ['mor', 'shd', 'snp', 'med', 'xbw']));
      if (t > 100 && Math.floor(t) % 15 === 0) out.push(chargeAll(w, slot));
      return out;
    },
  },
};

export const BOT_NAMES: readonly string[] = Object.keys(BOTS);
